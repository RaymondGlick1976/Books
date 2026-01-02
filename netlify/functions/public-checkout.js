// =============================================
// PUBLIC CHECKOUT - Create Stripe checkout session (no login required)
// =============================================

const Stripe = require('stripe');
const { getSupabase, success, error, handleCors, parseBody } = require('./utils');

exports.handler = async (event) => {
  const corsResponse = handleCors(event);
  if (corsResponse) return corsResponse;
  
  if (event.httpMethod !== 'POST') {
    return error('Method not allowed', 405);
  }
  
  const { token, selected_options, payment_amount } = parseBody(event);
  
  if (!token) {
    return error('Access token required', 400);
  }
  
  const supabase = getSupabase();
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  
  try {
    // Get quote by token
    const { data: quote, error: quoteError } = await supabase
      .from('quotes')
      .select('*, customers(name, email)')
      .eq('access_token', token)
      .single();
    
    if (quoteError || !quote) {
      return error('Invalid access token', 401);
    }
    
    // Check if already accepted
    if (quote.status === 'accepted') {
      return error('Quote has already been accepted', 400);
    }
    
    // Check if expired
    if (quote.expires_at && new Date(quote.expires_at) < new Date()) {
      return error('Quote has expired', 400);
    }
    
    // Update selected options if provided
    if (selected_options && selected_options.length > 0) {
      // First reset all optional items to not selected
      await supabase
        .from('quote_line_items')
        .update({ is_selected: false })
        .eq('quote_id', quote.id)
        .eq('is_optional', true);
      
      // Then mark selected ones
      await supabase
        .from('quote_line_items')
        .update({ is_selected: true })
        .eq('quote_id', quote.id)
        .in('id', selected_options);
    }
    
    // Recalculate quote totals
    const { data: lineItems } = await supabase
      .from('quote_line_items')
      .select('*')
      .eq('quote_id', quote.id);
    
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
    
    // Validate payment amount (with small tolerance)
    if (paymentAmount < minDeposit - 0.01) {
      return error(`Payment amount must be at least $${minDeposit.toFixed(2)}`);
    }
    
    // Ensure minimum $0.50 for Stripe
    paymentAmount = Math.max(paymentAmount, 0.50);
    
    // Create Stripe Checkout session
    const siteUrl = (process.env.SITE_URL || 'https://hcdbooks.netlify.app').replace(/\/+$/, '');
    
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: `${quote.quote_number} - ${quote.title}`,
            description: paymentAmount >= total ? 'Full Payment' : 'Deposit Payment',
          },
          unit_amount: Math.round(paymentAmount * 100),
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: `${siteUrl}/portal/quote.html?token=${token}&payment=success`,
      cancel_url: `${siteUrl}/portal/quote.html?token=${token}&payment=cancelled`,
      customer_email: quote.customers?.email,
      metadata: {
        quote_id: quote.id,
        customer_id: quote.customer_id,
        payment_type: paymentAmount >= total ? 'full' : 'partial',
        access_token: token,
      },
    });
    
    return success({ url: session.url });
    
  } catch (err) {
    console.error('Public checkout error:', err);
    return error('Failed to create checkout session', 500);
  }
};
