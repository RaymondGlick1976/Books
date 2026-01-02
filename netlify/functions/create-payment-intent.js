// =============================================
// CREATE PAYMENT INTENT - For invoice payments
// =============================================

const Stripe = require('stripe');
const { getSupabase, success, error, handleCors, parseBody, validateSession } = require('./utils');

exports.handler = async (event) => {
  const corsResponse = handleCors(event);
  if (corsResponse) return corsResponse;
  
  if (event.httpMethod !== 'POST') {
    return error('Method not allowed', 405);
  }
  
  const customer = await validateSession(event);
  if (!customer) {
    return error('Unauthorized', 401);
  }
  
  const { invoice_id, amount } = parseBody(event);
  
  if (!invoice_id || !amount) {
    return error('Invoice ID and amount required');
  }
  
  const supabase = getSupabase();
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  
  try {
    // Get invoice
    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', invoice_id)
      .eq('customer_id', customer.id)
      .single();
    
    if (invoiceError || !invoice) {
      return error('Invoice not found', 404);
    }
    
    // Validate amount
    const amountCents = Math.round(amount);
    const maxAmount = Math.round(parseFloat(invoice.amount_due) * 100);
    
    if (amountCents < 50) {
      return error('Minimum payment is $0.50');
    }
    
    if (amountCents > maxAmount) {
      return error('Amount exceeds balance due');
    }
    
    // Create payment intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: 'usd',
      metadata: {
        invoice_id,
        customer_id: customer.id,
        payment_type: 'invoice_payment',
      },
      receipt_email: customer.email,
    });
    
    // Create pending payment record
    await supabase
      .from('payments')
      .insert({
        invoice_id,
        customer_id: customer.id,
        amount: amountCents / 100,
        payment_type: 'progress',
        stripe_payment_intent_id: paymentIntent.id,
        status: 'pending',
      });
    
    return success({ clientSecret: paymentIntent.client_secret });
    
  } catch (err) {
    console.error('Payment intent error:', err);
    return error('Failed to create payment', 500);
  }
};
