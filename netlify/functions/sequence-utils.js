// =============================================
// SEQUENCE UTILS - shared helpers for automated stage email sequences
// (not an endpoint; required by send-sequence-emails / sequence-test-email)
// Rendering + merge fields live in public/js/email-blocks.js so the editor
// preview and the real send use identical code.
// =============================================

const EmailBlocks = require('../../public/js/email-blocks.js');

function siteUrl() {
  return (process.env.SITE_URL || 'https://hcdbooks.netlify.app').replace(/\/+$/, '');
}

// Company + branding settings -> brand object, plus from/reply-to addresses
async function loadBrand(supabase) {
  const { data } = await supabase.from('settings').select('key, value').in('key', ['company', 'branding']);
  const map = Object.fromEntries((data || []).map(r => [r.key, r.value || {}]));
  const company = map.company || {};
  return {
    brand: EmailBlocks.brandFromSettings(company, map.branding),
    fromEmail: company.from_email || company.email || process.env.FROM_EMAIL || 'noreply@homesteadcabinetdesign.com',
    replyTo: company.email || company.from_email || null,
    notificationEmail: company.notification_email || company.email || process.env.ADMIN_EMAIL || null
  };
}

function buildVars(deal, brand) {
  return EmailBlocks.buildVars(deal, brand, siteUrl());
}

function unsubscribeUrl(token) {
  return token ? `${siteUrl()}/.netlify/functions/unsubscribe?t=${encodeURIComponent(token)}` : '';
}

// Send through Resend or SendGrid (same providers as the rest of the app)
async function sendEmail({ to, subject, html, text, fromEmail, fromName, replyTo, unsubscribe }) {
  const listHeaders = unsubscribe
    ? { 'List-Unsubscribe': `<${unsubscribe}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' }
    : undefined;

  if (process.env.RESEND_API_KEY) {
    const payload = { from: `${fromName} <${fromEmail}>`, to: [to], subject, html, text };
    if (replyTo) payload.reply_to = replyTo;
    if (listHeaders) payload.headers = listHeaders;
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error(`Resend: ${await res.text()}`);
    return true;
  }
  if (process.env.SENDGRID_API_KEY) {
    const payload = {
      personalizations: [{ to: [{ email: to }] }],
      from: { email: fromEmail, name: fromName },
      subject,
      content: [{ type: 'text/plain', value: text || ' ' }, { type: 'text/html', value: html }]
    };
    if (replyTo) payload.reply_to = { email: replyTo };
    if (listHeaders) payload.headers = listHeaders;
    const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error(`SendGrid: ${await res.text()}`);
    return true;
  }
  console.log('[sequence] No email provider configured. Would send:', to, subject);
  return true;
}

const DEAL_SELECT = `id, name, stage, customer_id, automations_off,
  customer:customers(id, name, first_name, last_name, email, disable_drips, unsubscribe_token),
  quote:quotes!jobs_quote_id_fkey(id, quote_number, title, total, total_low, total_high, access_token)`;

module.exports = { EmailBlocks, loadBrand, buildVars, unsubscribeUrl, sendEmail, siteUrl, DEAL_SELECT };
