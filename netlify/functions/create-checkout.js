// =============================================
// CREATE CHECKOUT - Stripe Checkout for quote deposit
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
  
  const { quote_id, selected_options, payment_amount } = parseBody(event);
  
  if (!quote_id) {
    return error('Quote ID required');
  }
  
  const supabase = getSupabase();
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  
  try {
    // Get quote
    const { data: quote, error: quoteError } = await supabase
      .from('quotes')
      .select('*')
      .eq('id', quote_id)
      .eq('customer_id', customer.id)
      .single();
    
    if (quoteError || !quote) {
      return error('Quote not found', 404);
    }
    
    // Check quote is valid for acceptance
    if (!['sent', 'viewed'].includes(quote.status)) {
      return error('Quote cannot be accepted');
    }
    
    if (quote.expires_at && new Date(quote.expires_at) < new Date()) {
      return error('Quote has expired');
    }
    
    // Update selected options if provided
    if (selected_options && selected_options.length > 0) {
      // Reset all optional items
      await supabase
        .from('quote_line_items')
        .update({ is_selected: false })
        .eq('quote_id', quote_id)
        .eq('is_optional', true);
      
      // Set selected ones
      await supabase
        .from('quote_line_items')
        .update({ is_selected: true })
        .eq('quote_id', quote_id)
        .in('id', selected_options);
    }
    
    // Recalculate quote totals
    const { data: lineItems } = await supabase
      .from('quote_line_items')
      .select('*')
      .eq('quote_id', quote_id);
    
    let subtotal = 0;
    let taxableSubtotal = 0;
    lineItems.forEach(item => {
      if (!item.is_optional || item.is_selected) {
        const lineTotal = parseFloat(item.line_total || 0);
        subtotal += lineTotal;
        if (item.is_taxable) {
          taxableSubtotal += lineTotal;
        }
      }
    });
    
    const taxAmount = taxableSubtotal * parseFloat(quote.tax_rate || 0);
    const total = subtotal + taxAmount;
    
    // Calculate minimum deposit
    let minDeposit;
    if (quote.deposit_type === 'percentage') {
      minDeposit = total * (parseFloat(quote.deposit_value) / 100);
    } else {
      minDeposit = parseFloat(quote.deposit_value);
    }
    
    // Round to avoid floating point issues
    minDeposit = Math.round(minDeposit * 100) / 100;
    
    // Use custom payment amount if provided, otherwise use minimum deposit
    let paymentAmount = payment_amount ? Math.round(parseFloat(payment_amount) * 100) / 100 : minDeposit;
    
    // Validate payment amount is at least the minimum deposit (with small tolerance)
    if (paymentAmount < minDeposit - 0.01) {
      return error(`Payment amount must be at least $${minDeposit.toFixed(2)}`);
    }
    
    // Ensure minimum $0.50 for Stripe
    paymentAmount = Math.max(paymentAmount, 0.50);
    
    // Create Stripe Checkout session
    const siteUrl = (process.env.SITE_URL || 'https://homesteadcabinetdesign.com').replace(/\/+$/, '');
    
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      customer_email: customer.email,
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `Payment for ${quote.title}`,
              description: `Quote ${quote.quote_number}`,
            },
            unit_amount: Math.round(paymentAmount * 100), // Convert to cents
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${siteUrl}/portal/quote.html?id=${quote_id}&payment=success`,
      cancel_url: `${siteUrl}/portal/quote.html?id=${quote_id}&payment=cancelled`,
      metadata: {
        quote_id,
        customer_id: customer.id,
        payment_type: paymentAmount >= total ? 'full' : 'partial',
        payment_amount: paymentAmount.toFixed(2),
      },
    });
    
    return success({ url: session.url });
    
  } catch (err) {
    console.error('Checkout error:', err);
    return error('Failed to create checkout session', 500);
  }
};
