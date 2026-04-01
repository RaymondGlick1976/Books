// =============================================
// VERIFY CHECKOUT - Fallback to ensure quote is marked accepted
// Called from thank-you page in case webhook was delayed/failed
// =============================================

const Stripe = require('stripe');
const { getSupabase, success, error, handleCors, parseBody } = require('./utils');

exports.handler = async (event) => {
  const corsResponse = handleCors(event);
  if (corsResponse) return corsResponse;

  if (event.httpMethod !== 'POST') {
    return error('Method not allowed', 405);
  }

  const { session_id } = parseBody(event);

  if (!session_id) {
    return error('Session ID required', 400);
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const supabase = getSupabase();

  try {
    // Retrieve the checkout session from Stripe
    const session = await stripe.checkout.sessions.retrieve(session_id);

    if (session.payment_status !== 'paid') {
      return success({ verified: false, reason: 'Payment not completed' });
    }

    const { quote_id } = session.metadata || {};
    if (!quote_id) {
      return success({ verified: false, reason: 'No quote_id in session' });
    }

    // Check if quote is already accepted
    const { data: quote } = await supabase
      .from('quotes')
      .select('id, status')
      .eq('id', quote_id)
      .single();

    if (!quote) {
      return success({ verified: false, reason: 'Quote not found' });
    }

    if (quote.status === 'accepted') {
      return success({ verified: true, already_accepted: true });
    }

    // Quote not yet accepted - webhook may have failed. Update it now.
    console.log('verify-checkout: Quote not yet accepted, updating now:', quote_id);

    const { error: updateError } = await supabase
      .from('quotes')
      .update({
        status: 'accepted',
        accepted_at: new Date().toISOString(),
      })
      .eq('id', quote_id);

    if (updateError) {
      console.error('verify-checkout: Failed to update quote:', updateError);
      return error('Failed to update quote status', 500);
    }

    console.log('verify-checkout: Quote marked as accepted:', quote_id);
    return success({ verified: true, updated: true });

  } catch (err) {
    console.error('verify-checkout error:', err);
    return error('Verification failed', 500);
  }
};
