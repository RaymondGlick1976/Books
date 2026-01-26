// =============================================
// QUICKBOOKS AUTH - Start OAuth flow
// =============================================

exports.handler = async (event) => {
  const clientId = process.env.QB_CLIENT_ID;
  const redirectUri = process.env.QB_REDIRECT_URI || `${process.env.SITE_URL}/.netlify/functions/qb-callback`;
  
  if (!clientId) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'QuickBooks not configured. Add QB_CLIENT_ID to environment variables.' })
    };
  }
  
  // QuickBooks OAuth 2.0 authorization URL
  const scope = 'com.intuit.quickbooks.accounting';
  const state = Math.random().toString(36).substring(7); // Simple state for CSRF protection
  
  const authUrl = new URL('https://appcenter.intuit.com/connect/oauth2');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', scope);
  authUrl.searchParams.set('state', state);
  
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ authUrl: authUrl.toString() })
  };
};
