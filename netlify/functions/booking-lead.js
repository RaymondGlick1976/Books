const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

// Validate HMAC token and return payload
function verifyToken(token) {
  const secret = process.env.BOOKING_TOKEN_SECRET;
  if (!secret) throw new Error('Token secret not configured');

  const parts = token.split('.');
  if (parts.length !== 2) throw new Error('Invalid token format');

  const [payloadB64, sig] = parts;
  const expected = crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expected);
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    throw new Error('Invalid token signature');
  }

  const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());
  if (payload.exp && Date.now() > payload.exp) {
    throw new Error('Token expired');
  }

  return payload;
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const token = event.queryStringParameters?.token;
    if (!token) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing token' }) };
    }

    const payload = verifyToken(token);

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Fetch deal + customer in one query
    const { data: deal, error: dealError } = await supabase
      .from('jobs')
      .select('id, customer_id, customers(id, name, email, phone)')
      .eq('id', payload.deal_id)
      .single();

    if (dealError || !deal) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: 'Lead not found' }) };
    }

    // Fetch form config for thank-you message and redirect URL
    let formConfig = null;
    if (payload.form_id) {
      const { data: form } = await supabase
        .from('booking_forms')
        .select('thank_you_title, thank_you_message, thank_you_redirect_url, primary_color')
        .eq('id', payload.form_id)
        .single();
      formConfig = form;
    }

    const customer = deal.customers;
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        customer: customer ? {
          name: customer.name,
          email: customer.email,
          phone: customer.phone
        } : null,
        form: formConfig
      })
    };

  } catch (err) {
    console.error('Booking lead error:', err.message);
    // Return 200 with empty data on token errors — schedule page works as standalone
    if (err.message.includes('Token') || err.message.includes('Invalid') || err.message.includes('expired')) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ customer: null, form: null, expired: true })
      };
    }
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Server error' })
    };
  }
};
