// =============================================
// QUICKBOOKS API UTILITIES
// =============================================

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Get the QuickBooks connection and refresh token if needed
async function getQBConnection() {
  const { data: connection, error } = await supabase
    .from('quickbooks_connection')
    .select('*')
    .single();
  
  if (error || !connection) {
    throw new Error('QuickBooks not connected');
  }
  
  // Check if token is expired or will expire in next 5 minutes
  const expiresAt = new Date(connection.token_expires_at);
  const now = new Date();
  const fiveMinutes = 5 * 60 * 1000;
  
  if (expiresAt - now < fiveMinutes) {
    // Refresh the token
    const newTokens = await refreshAccessToken(connection.refresh_token);
    
    // Update in database
    const newExpiresAt = new Date(Date.now() + (newTokens.expires_in * 1000)).toISOString();
    await supabase
      .from('quickbooks_connection')
      .update({
        access_token: newTokens.access_token,
        refresh_token: newTokens.refresh_token,
        token_expires_at: newExpiresAt,
        updated_at: new Date().toISOString()
      })
      .eq('id', connection.id);
    
    connection.access_token = newTokens.access_token;
  }
  
  return connection;
}

// Refresh the access token
async function refreshAccessToken(refreshToken) {
  const clientId = process.env.QB_CLIENT_ID;
  const clientSecret = process.env.QB_CLIENT_SECRET;
  
  const response = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken
    })
  });
  
  const tokens = await response.json();
  
  if (!response.ok || tokens.error) {
    throw new Error('Failed to refresh token: ' + (tokens.error_description || tokens.error));
  }
  
  return tokens;
}

// Make an authenticated request to QuickBooks API
async function qbRequest(method, endpoint, body = null) {
  const connection = await getQBConnection();
  
  // Use sandbox URL for development, production for live
  const baseUrl = process.env.QB_SANDBOX === 'true' 
    ? 'https://sandbox-quickbooks.api.intuit.com'
    : 'https://quickbooks.api.intuit.com';
  
  const url = `${baseUrl}/v3/company/${connection.realm_id}${endpoint}`;
  
  const headers = {
    'Authorization': `Bearer ${connection.access_token}`,
    'Accept': 'application/json',
    'Content-Type': 'application/json'
  };
  
  const options = { method, headers };
  if (body) {
    options.body = JSON.stringify(body);
  }
  
  const response = await fetch(url, options);
  const data = await response.json();
  
  if (!response.ok) {
    console.error('QB API Error:', data);
    throw new Error(data.Fault?.Error?.[0]?.Message || 'QuickBooks API error');
  }
  
  return data;
}

// Check connection status
async function getConnectionStatus() {
  try {
    const { data: connection } = await supabase
      .from('quickbooks_connection')
      .select('realm_id, connected_at, token_expires_at')
      .single();
    
    if (!connection) {
      return { connected: false };
    }
    
    return {
      connected: true,
      realmId: connection.realm_id,
      connectedAt: connection.connected_at,
      tokenExpiresAt: connection.token_expires_at
    };
  } catch (err) {
    return { connected: false };
  }
}

module.exports = {
  getQBConnection,
  refreshAccessToken,
  qbRequest,
  getConnectionStatus,
  supabase
};
