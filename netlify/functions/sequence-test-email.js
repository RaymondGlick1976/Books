// =============================================
// SEQUENCE TEST EMAIL - sends a preview of one sequence email.
// Always goes to the company notification address (Settings → Company),
// never to a customer, so this endpoint can't be used to email anyone else.
// POST { subject, preheader, style, blocks, deal_id? }
// =============================================

const { createClient } = require('@supabase/supabase-js');
const { EmailBlocks, loadBrand, buildVars, sendEmail, DEAL_SELECT } = require('./sequence-utils');

const headers = { 'Content-Type': 'application/json' };

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  try {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const input = JSON.parse(event.body || '{}');
    const { brand, fromEmail, notificationEmail } = await loadBrand(supabase);
    if (!notificationEmail) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Set a notification email in Settings → Company first.' }) };
    }

    let vars = { ...EmailBlocks.SAMPLE_VARS, company_name: brand.name, company_phone: brand.phone, company_website: brand.website };
    if (input.deal_id) {
      const { data: deal } = await supabase.from('jobs').select(DEAL_SELECT).eq('id', input.deal_id).maybeSingle();
      if (deal) vars = buildVars(deal, brand);
    }

    const rendered = EmailBlocks.renderEmail(
      { subject: input.subject, preheader: input.preheader, style: input.style, blocks: Array.isArray(input.blocks) ? input.blocks : [] },
      { vars, brand, unsubscribeUrl: '' }
    );

    await sendEmail({
      to: notificationEmail,
      subject: `[Test] ${rendered.subject || '(no subject)'}`,
      html: rendered.html,
      text: rendered.text,
      fromEmail,
      fromName: brand.name
    });

    return { statusCode: 200, headers, body: JSON.stringify({ success: true, sent_to: notificationEmail }) };
  } catch (err) {
    console.error('[sequence-test-email]', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
