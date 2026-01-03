// =============================================
// STRIPE WEBHOOK - Handle Stripe events
// =============================================

const Stripe = require('stripe');
const { Resend } = require('resend');
const { getSupabase, success, error } = require('./utils');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return error('Method not allowed', 405);
  }
  
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  
  let stripeEvent;
  
  try {
    const sig = event.headers['stripe-signature'];
    stripeEvent = stripe.webhooks.constructEvent(event.body, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return error(`Webhook Error: ${err.message}`, 400);
  }
  
  const supabase = getSupabase();
  
  try {
    switch (stripeEvent.type) {
      case 'checkout.session.completed': {
        const session = stripeEvent.data.object;
        await handleCheckoutComplete(supabase, session);
        break;
      }
      
      case 'payment_intent.succeeded': {
        const paymentIntent = stripeEvent.data.object;
        await handlePaymentSuccess(supabase, paymentIntent);
        break;
      }
      
      case 'payment_intent.payment_failed': {
        const paymentIntent = stripeEvent.data.object;
        await handlePaymentFailed(supabase, paymentIntent);
        break;
      }
    }
    
    return success({ received: true });
    
  } catch (err) {
    console.error('Webhook handler error:', err);
    return error('Webhook handler failed', 500);
  }
};

async function handleCheckoutComplete(supabase, session) {
  const { quote_id, customer_id, payment_type } = session.metadata;
  
  if (!quote_id) return;
  
  // Get quote
  const { data: quote } = await supabase
    .from('quotes')
    .select('*')
    .eq('id', quote_id)
    .single();
  
  if (!quote) return;
  
  // Update quote status
  await supabase
    .from('quotes')
    .update({
      status: 'accepted',
      accepted_at: new Date().toISOString(),
    })
    .eq('id', quote_id);
  
  // Create invoice from quote
  const { data: invoiceNumber } = await supabase.rpc('generate_invoice_number');
  
  const { data: invoice } = await supabase
    .from('invoices')
    .insert({
      invoice_number: invoiceNumber,
      quote_id,
      customer_id: quote.customer_id,
      title: quote.title,
      status: 'partial',
      subtotal: quote.subtotal,
      tax_rate: quote.tax_rate,
      tax_amount: quote.tax_amount,
      total: quote.total,
      amount_paid: session.amount_total / 100,
      amount_due: quote.total - (session.amount_total / 100),
      due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      sent_at: new Date().toISOString(),
    })
    .select()
    .single();
  
  // Copy line items to invoice
  const { data: quoteItems } = await supabase
    .from('quote_line_items')
    .select('*')
    .eq('quote_id', quote_id)
    .or('is_optional.eq.false,is_selected.eq.true');
  
  if (quoteItems && quoteItems.length > 0) {
    const invoiceItems = quoteItems.map(item => ({
      invoice_id: invoice.id,
      description: item.description,
      details: item.details,
      quantity: item.quantity,
      unit: item.unit,
      unit_price: item.unit_price,
      line_total: item.line_total,
      is_taxable: item.is_taxable,
      sort_order: item.sort_order,
    }));
    
    await supabase.from('invoice_line_items').insert(invoiceItems);
  }
  
  // Record payment
  await supabase
    .from('payments')
    .insert({
      invoice_id: invoice.id,
      customer_id: quote.customer_id,
      amount: session.amount_total / 100,
      payment_type: 'deposit',
      stripe_payment_intent_id: session.payment_intent,
      status: 'succeeded',
    });
  
  // Queue notifications
  await supabase.from('notification_queue').insert([
    {
      customer_id: quote.customer_id,
      notification_type: 'quote_accepted',
      reference_type: 'quote',
      reference_id: quote_id,
      is_admin_notification: true,
    },
    {
      customer_id: quote.customer_id,
      notification_type: 'payment_received',
      reference_type: 'payment',
      reference_id: invoice.id,
    },
  ]);
  
  // Send immediate confirmation emails
  await sendPaymentConfirmation(supabase, quote.customer_id, session.amount_total / 100, invoice);
}

async function handlePaymentSuccess(supabase, paymentIntent) {
  const { invoice_id } = paymentIntent.metadata || {};
  
  if (!invoice_id) return;
  
  // Update payment record
  await supabase
    .from('payments')
    .update({ status: 'succeeded' })
    .eq('stripe_payment_intent_id', paymentIntent.id);
  
  // Get invoice to recalculate
  const { data: invoice } = await supabase
    .from('invoices')
    .select('*')
    .eq('id', invoice_id)
    .single();
  
  if (invoice) {
    // Calculate new amounts
    const paymentAmount = paymentIntent.amount / 100;
    const newAmountPaid = parseFloat(invoice.amount_paid || 0) + paymentAmount;
    const newAmountDue = parseFloat(invoice.total) - newAmountPaid;
    const newStatus = newAmountDue <= 0.01 ? 'paid' : 'partial';
    
    // Update invoice
    await supabase
      .from('invoices')
      .update({
        amount_paid: newAmountPaid,
        amount_due: Math.max(0, newAmountDue),
        status: newStatus,
      })
      .eq('id', invoice_id);
    
    // Refresh invoice for email
    const { data: updatedInvoice } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', invoice_id)
      .single();
    
    // Send confirmation
    await sendPaymentConfirmation(supabase, invoice.customer_id, paymentAmount, updatedInvoice || invoice);
  }
}

async function handlePaymentFailed(supabase, paymentIntent) {
  await supabase
    .from('payments')
    .update({ status: 'failed' })
    .eq('stripe_payment_intent_id', paymentIntent.id);
}

async function sendPaymentConfirmation(supabase, customerId, amount, invoice) {
  // Get customer
  const { data: customer } = await supabase
    .from('customers')
    .select('*')
    .eq('id', customerId)
    .single();
  
  if (!customer || !process.env.RESEND_API_KEY) return;
  
  const resend = new Resend(process.env.RESEND_API_KEY);
  
  // Email to customer
  await resend.emails.send({
    from: 'Homestead Cabinet Design <noreply@homesteadcabinetdesign.com>',
    to: customer.email,
    subject: 'Payment Confirmation - Homestead Cabinet Design',
    html: `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #6366f1; padding: 30px; text-align: center;">
          <h1 style="color: #fff; margin: 0; font-weight: 600;">Payment Received</h1>
          <p style="color: rgba(255,255,255,0.8); margin: 5px 0 0; font-size: 14px;">Thank you for your payment!</p>
        </div>
        <div style="padding: 30px; background: #f8fafc;">
          <p style="color: #1e293b;">Hi ${customer.name.split(' ')[0]},</p>
          <p style="color: #475569;">Thank you for your payment of <strong style="color: #6366f1;">$${amount.toFixed(2)}</strong>.</p>
          <div style="background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 20px 0;">
            <p style="margin: 5px 0; color: #475569;"><strong>Invoice:</strong> ${invoice.invoice_number}</p>
            <p style="margin: 5px 0; color: #475569;"><strong>Remaining Balance:</strong> <span style="color: ${parseFloat(invoice.amount_due) > 0 ? '#ef4444' : '#10b981'}; font-weight: bold;">$${parseFloat(invoice.amount_due).toFixed(2)}</span></p>
          </div>
          <p style="color: #475569;">You can view your invoice and payment history in your <a href="${process.env.SITE_URL}/portal/invoices.html" style="color: #6366f1;">customer portal</a>.</p>
          <p style="color: #475569;">Thank you for choosing Homestead Cabinet Design!</p>
        </div>
        <div style="padding: 20px; text-align: center; background: #1e293b; color: #94a3b8; font-size: 12px;">
          <p style="margin: 0;">Homestead Cabinet Design</p>
          <p style="margin: 5px 0;">Western MA & Northern CT</p>
        </div>
      </div>
    `,
  });
  
  // Email to admin
  if (process.env.ADMIN_EMAIL) {
    await resend.emails.send({
      from: 'Homestead Cabinet Design <noreply@homesteadcabinetdesign.com>',
      to: process.env.ADMIN_EMAIL,
      subject: `Payment Received: $${amount.toFixed(2)} from ${customer.name}`,
      html: `
        <p>Payment received from ${customer.name} (${customer.email})</p>
        <p><strong>Amount:</strong> $${amount.toFixed(2)}</p>
        <p><strong>Invoice:</strong> ${invoice.invoice_number}</p>
        <p><strong>Remaining Balance:</strong> $${parseFloat(invoice.amount_due).toFixed(2)}</p>
      `,
    });
  }
}
