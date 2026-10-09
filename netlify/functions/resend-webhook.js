// =============================================
// RESEND WEBHOOK - Email click tracking
// When a customer clicks the "View Quote" link in a quote email,
// mark the quote as Viewed (if it's still in "sent" status).
//
// Setup (one time):
//   1. Resend dashboard → Webhooks → Add endpoint:
//        https://hcdbooks.netlify.app/.netlify/functions/resend-webhook
//      Event: email.clicked
//   2. Copy the endpoint's signing secret (whsec_...) into the Netlify
//      env var RESEND_WEBHOOK_SECRET, then redeploy.
// =============================================

const crypto = require('crypto');
const { getSupabase } = require('./utils');

// Clicks this soon after the email went out are almost always
// security scanners (Outlook Safe Links, Proofpoint, etc.), not people.
const MIN_SECONDS_AFTER_SEND = 30;

// User agents of link scanners / previewers, not humans.
const BOT_UA = /bot|crawl|spider|preview|scanner|safelinks|proofpoint|mimecast|barracuda|urldefense|python|curl|wget|headless|go-http|java\/|okhttp|axios|node-fetch/i;

function respond(statusCode, body) {
  return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

// Resend signs webhooks with Svix: HMAC-SHA256 over "id.timestamp.body"
function verifySignature(rawBody, headers, secret) {
  const h = {};
  for (const [k, v] of Object.entries(headers || {})) h[k.toLowerCase()] = v;
  const id = h['svix-id'];
  const timestamp = h['svix-timestamp'];
  const sigHeader = h['svix-signature'];
  if (!id || !timestamp || !sigHeader) return false;

  // Reject anything older/newer than 5 minutes (replay protection)
  const ts = parseInt(timestamp, 10);
  if (!ts || Math.abs(Date.now() / 1000 - ts) > 300) return false;

  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = crypto
    .createHmac('sha256', key)
    .update(`${id}.${timestamp}.${rawBody}`)
    .digest('base64');

  // Header looks like "v1,sig1 v1,sig2"
  return sigHeader.split(' ').some(part => {
    const sig = part.split(',')[1];
    if (!sig) return false;
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  });
}

// Pull the quote access token out of the clicked link
function extractQuoteToken(link) {
  if (!link) return null;
  let url = link;
  try { url = decodeURIComponent(link); } catch (e) { /* use as-is */ }
  const m = url.match(/\/portal\/quote\.html\?(?:[^#]*&)?token=([A-Za-z0-9-]+)/);
  return m ? m[1] : null;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return respond(405, { error: 'Method not allowed' });

  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    console.error('RESEND_WEBHOOK_SECRET is not set; ignoring webhook');
    return respond(500, { error: 'Webhook not configured' });
  }

  const rawBody = event.isBase64Encoded
    ? Buffer.from(event.body || '', 'base64').toString('utf8')
    : (event.body || '');

  if (!verifySignature(rawBody, event.headers, secret)) {
    console.warn('Resend webhook signature verification failed');
    return respond(401, { error: 'Invalid signature' });
  }

  let payload;
  try { payload = JSON.parse(rawBody); } catch (e) { return respond(400, { error: 'Bad JSON' }); }

  // Only clicks matter here; acknowledge everything else so Resend doesn't retry
  if (payload.type !== 'email.clicked') return respond(200, { ignored: payload.type });

  const data = payload.data || {};
  const click = data.click || {};
  const token = extractQuoteToken(click.link);
  if (!token) return respond(200, { ignored: 'not a quote link' });

  // Filter out link scanners
  const ua = click.userAgent || click.user_agent || '';
  if (!ua || BOT_UA.test(ua)) {
    console.log('Skipping click from scanner UA:', ua || '(none)');
    return respond(200, { ignored: 'scanner' });
  }
  const sentAt = data.created_at ? new Date(data.created_at).getTime() : null;
  const clickedAt = click.timestamp ? new Date(click.timestamp).getTime() : Date.now();
  if (sentAt && (clickedAt - sentAt) / 1000 < MIN_SECONDS_AFTER_SEND) {
    console.log('Skipping click within', MIN_SECONDS_AFTER_SEND, 's of send (likely scanner)');
    return respond(200, { ignored: 'too soon after send' });
  }

  const supabase = getSupabase();

  try {
    const { data: quote } = await supabase
      .from('quotes')
      .select('id, quote_number, customer_id, status')
      .eq('access_token', token)
      .maybeSingle();

    if (!quote) return respond(200, { ignored: 'quote not found' });

    const clickedIso = new Date(clickedAt).toISOString();

    if (quote.status === 'sent') {
      await supabase
        .from('quotes')
        .update({ status: 'viewed', viewed_at: clickedIso })
        .eq('id', quote.id)
        .eq('status', 'sent'); // don't clobber a status that changed meanwhile
    }

    try {
      await supabase.from('activity_log').insert({
        customer_id: quote.customer_id,
        activity_type: 'quote_link_clicked',
        reference_type: 'quote',
        reference_id: quote.id,
        description: `Customer clicked View Quote in email (${quote.quote_number})`,
        ip_address: click.ipAddress || click.ip_address || null
      });
    } catch (logErr) {
      console.log('Activity log insert failed (non-fatal):', logErr.message);
    }

    console.log('Quote link click recorded:', quote.quote_number, 'status was', quote.status);
    return respond(200, { ok: true });
  } catch (err) {
    console.error('Resend webhook error:', err);
    return respond(500, { error: 'Server error' });
  }
};
