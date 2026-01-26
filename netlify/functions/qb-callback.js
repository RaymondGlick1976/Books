// =============================================
// QUICKBOOKS CALLBACK - Handle OAuth callback
// =============================================

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async (event) => {
  const { code, realmId, error: oauthError } = event.queryStringParameters || {};
  
  const siteUrl = process.env.SITE_URL || 'https://hcdbooks.netlify.app';
  
  if (oauthError) {
    return {
      statusCode: 302,
      headers: { Location: `${siteUrl}/admin/settings.html?qb_error=${encodeURIComponent(oauthError)}` }
    };
  }
  
  if (!code || !realmId) {
    return {
      statusCode: 302,
      headers: { Location: `${siteUrl}/admin/settings.html?qb_error=missing_params` }
    };
  }
  
  const clientId = process.env.QB_CLIENT_ID;
  const clientSecret = process.env.QB_CLIENT_SECRET;
  const redirectUri = process.env.QB_REDIRECT_URI || `${siteUrl}/.netlify/functions/qb-callback`;
  
  if (!clientId || !clientSecret) {
    return {
      statusCode: 302,
      headers: { Location: `${siteUrl}/admin/settings.html?qb_error=not_configured` }
    };
  }
  
  try {
    // Exchange code for tokens
    const tokenResponse = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: redirectUri
      })
    });
    
    const tokens = await tokenResponse.json();
    
    if (!tokenResponse.ok || tokens.error) {
      console.error('Token exchange error:', tokens);
      return {
        statusCode: 302,
        headers: { Location: `${siteUrl}/admin/settings.html?qb_error=token_exchange_failed` }
      };
    }
    
    // Calculate token expiration (usually 1 hour)
    const expiresAt = new Date(Date.now() + (tokens.expires_in * 1000)).toISOString();
    
    // Store or update connection in database
    // First, delete any existing connections (only one QB connection at a time)
    await supabase.from('quickbooks_connection').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    
    // Insert new connection
    const { error: insertError } = await supabase.from('quickbooks_connection').insert({
      realm_id: realmId,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_expires_at: expiresAt
    });
    
    if (insertError) {
      console.error('Failed to save QB connection:', insertError);
      return {
        statusCode: 302,
        headers: { Location: `${siteUrl}/admin/settings.html?qb_error=save_failed` }
      };
    }
    
    // Success - redirect back to settings
    return {
      statusCode: 302,
      headers: { Location: `${siteUrl}/admin/settings.html?qb_connected=1` }
    };
    
  } catch (err) {
    console.error('QB callback error:', err);
    return {
      statusCode: 302,
      headers: { Location: `${siteUrl}/admin/settings.html?qb_error=unexpected` }
    };
  }
};
