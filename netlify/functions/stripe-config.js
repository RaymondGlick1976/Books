// =============================================
// STRIPE CONFIG - Get publishable key
// =============================================

const { getSupabase, success, error, handleCors, validateSession } = require('./utils');

exports.handler = async (event) => {
  const corsResponse = handleCors(event);
  if (corsResponse) return corsResponse;

  // Allow access with a valid invoice/quote token (publishable key is public by design)
  const token = event.queryStringParameters?.token;
  if (token) {
    const supabase = getSupabase();
    // Verify token belongs to a real invoice or quote
    const { data: invoice } = await supabase
      .from('invoices')
      .select('id')
      .eq('access_token', token)
      .single();

    if (!invoice) {
      const { data: quote } = await supabase
        .from('quotes')
        .select('id')
        .eq('access_token', token)
        .single();

      if (!quote) {
        return error('Invalid token', 401);
      }
    }

    return success({
      publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
    });
  }

  // Otherwise require authenticated session
  const customer = await validateSession(event);
  if (!customer) {
    return error('Unauthorized', 401);
  }

  return success({
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
  });
};
