// =============================================
// GOOGLE CALENDAR CALLBACK - Handle OAuth callback
// =============================================

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async (event) => {
  const { code, error: oauthError } = event.queryStringParameters || {};

  const siteUrl = process.env.SITE_URL || 'https://hcdbooks.netlify.app';

  if (oauthError) {
    return {
      statusCode: 302,
      headers: { Location: `${siteUrl}/admin/settings.html?gcal_error=${encodeURIComponent(oauthError)}` }
    };
  }

  if (!code) {
    return {
      statusCode: 302,
      headers: { Location: `${siteUrl}/admin/settings.html?gcal_error=missing_params` }
    };
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${siteUrl}/.netlify/functions/gcal-callback`;

  if (!clientId || !clientSecret) {
    return {
      statusCode: 302,
      headers: { Location: `${siteUrl}/admin/settings.html?gcal_error=not_configured` }
    };
  }

  try {
    // Exchange code for tokens (Google uses POST body params, not Basic Auth)
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: redirectUri,
        client_id: clientId,
        client_secret: clientSecret
      })
    });

    const tokens = await tokenResponse.json();

    if (!tokenResponse.ok || tokens.error) {
      console.error('Google token exchange error:', tokens);
      return {
        statusCode: 302,
        headers: { Location: `${siteUrl}/admin/settings.html?gcal_error=token_exchange_failed` }
      };
    }

    // Calculate token expiration (usually 1 hour)
    const expiresAt = new Date(Date.now() + (tokens.expires_in * 1000)).toISOString();

    // Delete any existing connections (only one GCal connection at a time)
    await supabase.from('google_calendar_connection').delete().neq('id', '00000000-0000-0000-0000-000000000000');

    // Insert new connection
    const { error: insertError } = await supabase.from('google_calendar_connection').insert({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_expires_at: expiresAt
    });

    if (insertError) {
      console.error('Failed to save GCal connection:', insertError);
      return {
        statusCode: 302,
        headers: { Location: `${siteUrl}/admin/settings.html?gcal_error=save_failed` }
      };
    }

    // Success - redirect back to settings
    return {
      statusCode: 302,
      headers: { Location: `${siteUrl}/admin/settings.html?gcal_connected=1` }
    };

  } catch (err) {
    console.error('GCal callback error:', err);
    return {
      statusCode: 302,
      headers: { Location: `${siteUrl}/admin/settings.html?gcal_error=unexpected` }
    };
  }
};
