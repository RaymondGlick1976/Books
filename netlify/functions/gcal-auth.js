// =============================================
// GOOGLE CALENDAR AUTH - Start OAuth flow
// =============================================

exports.handler = async (event) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${process.env.SITE_URL}/.netlify/functions/gcal-callback`;

  if (!clientId) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Google Calendar not configured. Add GOOGLE_CLIENT_ID to environment variables.' })
    };
  }

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', 'https://www.googleapis.com/auth/calendar');
  authUrl.searchParams.set('access_type', 'offline');
  authUrl.searchParams.set('prompt', 'consent');

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ authUrl: authUrl.toString() })
  };
};
