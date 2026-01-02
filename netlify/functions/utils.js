// =============================================
// SHARED UTILITIES FOR NETLIFY FUNCTIONS
// =============================================

const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase with service role for admin access
function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

// Standard response helpers
function success(data, statusCode = 200) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
    body: JSON.stringify(data),
  };
}

function error(message, statusCode = 400) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
    body: JSON.stringify({ error: message }),
  };
}

// CORS preflight handler
function handleCors(event) {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      },
      body: '',
    };
  }
  return null;
}

// Parse request body
function parseBody(event) {
  try {
    return event.body ? JSON.parse(event.body) : {};
  } catch {
    return {};
  }
}

// Get session from cookie
function getSessionToken(event) {
  const cookies = event.headers.cookie || '';
  const match = cookies.match(/portal_session=([^;]+)/);
  return match ? match[1] : null;
}

// Validate portal session and return customer
async function validateSession(event) {
  const token = getSessionToken(event);
  if (!token) {
    return null;
  }
  
  const supabase = getSupabase();
  
  const { data: authToken, error: tokenError } = await supabase
    .from('auth_tokens')
    .select('*, customer:customers(*)')
    .eq('token', token)
    .eq('token_type', 'session')
    .gt('expires_at', new Date().toISOString())
    .single();
  
  if (tokenError || !authToken) {
    return null;
  }
  
  return authToken.customer;
}

// Set session cookie
function setSessionCookie(token, maxAge = 30 * 24 * 60 * 60) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `portal_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

// Clear session cookie
function clearSessionCookie() {
  return 'portal_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0';
}

// Generate random token
function generateToken() {
  return require('crypto').randomUUID();
}

module.exports = {
  getSupabase,
  success,
  error,
  handleCors,
  parseBody,
  getSessionToken,
  validateSession,
  setSessionCookie,
  clearSessionCookie,
  generateToken,
};
