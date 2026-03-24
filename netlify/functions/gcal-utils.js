// =============================================
// GOOGLE CALENDAR API UTILITIES
// =============================================

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Get the Google Calendar connection and refresh token if needed
async function getGCalConnection() {
  const { data: connection, error } = await supabase
    .from('google_calendar_connection')
    .select('*')
    .single();

  if (error || !connection) {
    throw new Error('Google Calendar not connected');
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
      .from('google_calendar_connection')
      .update({
        access_token: newTokens.access_token,
        refresh_token: newTokens.refresh_token || connection.refresh_token,
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
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret
    })
  });

  const tokens = await response.json();

  if (!response.ok || tokens.error) {
    throw new Error('Failed to refresh Google token: ' + (tokens.error_description || tokens.error));
  }

  return tokens;
}

// Make an authenticated request to Google Calendar API
async function gcalRequest(method, path, body = null) {
  const connection = await getGCalConnection();

  const url = `https://www.googleapis.com/calendar/v3${path}`;

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

  // DELETE returns 204 with no body
  if (response.status === 204) {
    return null;
  }

  const data = await response.json();

  if (!response.ok) {
    console.error('GCal API Error:', data);
    throw new Error(data.error?.message || 'Google Calendar API error');
  }

  return data;
}

// Check connection status
async function getConnectionStatus() {
  try {
    const { data: connection } = await supabase
      .from('google_calendar_connection')
      .select('calendar_id, connected_at, token_expires_at')
      .single();

    if (!connection) {
      return { connected: false };
    }

    return {
      connected: true,
      calendarId: connection.calendar_id || 'primary',
      connectedAt: connection.connected_at,
      tokenExpiresAt: connection.token_expires_at
    };
  } catch (err) {
    return { connected: false };
  }
}

module.exports = {
  getGCalConnection,
  refreshAccessToken,
  gcalRequest,
  getConnectionStatus,
  supabase
};
