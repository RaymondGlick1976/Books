// =============================================
// ADMIN PORTAL ACCESS - Generate session for admin to view customer portal
// =============================================

const { getSupabase, handleCors, setSessionCookie, generateToken } = require('./utils');

exports.handler = async (event) => {
  const corsResponse = handleCors(event);
  if (corsResponse) return corsResponse;

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  let customerId;
  try {
    const body = JSON.parse(event.body);
    customerId = body.customer_id;
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request' }) };
  }

  if (!customerId) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing customer_id' }) };
  }

  const supabase = getSupabase();

  try {
    // Verify customer exists
    const { data: customer, error: custError } = await supabase
      .from('customers')
      .select('id, name')
      .eq('id', customerId)
      .single();

    if (custError || !customer) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Customer not found' }) };
    }

    // Create session token
    const sessionToken = generateToken();
    const sessionExpires = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 hours for admin access

    await supabase
      .from('auth_tokens')
      .insert({
        customer_id: customerId,
        token: sessionToken,
        token_type: 'session',
        expires_at: sessionExpires.toISOString(),
        ip_address: event.headers['x-forwarded-for'] || event.headers['client-ip'],
        user_agent: 'Admin Portal Access',
      });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': setSessionCookie(sessionToken, 2 * 60 * 60), // 2 hours
      },
      body: JSON.stringify({ success: true })
    };

  } catch (err) {
    console.error('Admin portal access error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Failed to create portal session' }) };
  }
};
