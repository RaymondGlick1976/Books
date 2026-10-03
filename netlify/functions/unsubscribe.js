// =============================================
// UNSUBSCRIBE - opt a customer out of automated sequence emails.
// GET  ?t=<token>  -> confirmation page with a button (link scanners won't unsubscribe people)
// POST ?t=<token>  -> unsubscribes (button, or one-click List-Unsubscribe from Gmail/Apple Mail)
// Sets customers.disable_drips = true, which cancels pending sequence emails.
// =============================================

const { createClient } = require('@supabase/supabase-js');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function page(title, message, form) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
  body{margin:0;background:#f2f3ef;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#333}
  .card{max-width:440px;margin:12vh auto;background:#fff;border-radius:12px;padding:32px;box-shadow:0 2px 12px rgba(0,0,0,.06);text-align:center}
  h1{font-size:22px;margin:0 0 12px}p{line-height:1.6;color:#555;margin:0 0 20px}
  button{background:#38571a;color:#fff;border:0;border-radius:8px;padding:12px 24px;font-size:16px;cursor:pointer}
</style></head><body><div class="card"><h1>${title}</h1><p>${message}</p>${form || ''}</div></body></html>`;
}

const html = (statusCode, body) => ({ statusCode, headers: { 'Content-Type': 'text/html; charset=utf-8' }, body });

exports.handler = async (event) => {
  const token = (event.queryStringParameters || {}).t || '';
  if (!UUID_RE.test(token)) return html(400, page('Link not valid', 'This unsubscribe link is incomplete or expired.'));

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: customer } = await supabase
    .from('customers').select('id, disable_drips').eq('unsubscribe_token', token).maybeSingle();
  if (!customer) return html(404, page('Link not valid', 'We couldn’t find this subscription.'));

  if (event.httpMethod === 'POST') {
    if (!customer.disable_drips) {
      const { error } = await supabase.from('customers').update({ disable_drips: true }).eq('id', customer.id);
      if (error) return html(500, page('Something went wrong', 'Please try again, or reply to any of our emails and we’ll take care of it.'));
    }
    return html(200, page('You’re unsubscribed', 'You won’t receive any more automated emails from Homestead Cabinet Design. We’ll still reach out personally about any active project.'));
  }

  if (customer.disable_drips) {
    return html(200, page('Already unsubscribed', 'You won’t receive any more automated emails from us.'));
  }
  return html(200, page('Unsubscribe?', 'Stop receiving automated follow-up emails from Homestead Cabinet Design.',
    `<form method="POST" action="?t=${encodeURIComponent(token)}"><button type="submit">Unsubscribe</button></form>`));
};
