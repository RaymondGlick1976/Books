// =============================================
// EXPIRE QUOTE DEALS - Daily cron
// When a deal's linked quote has passed its expiration date without being
// accepted, move the deal (jobs row) to the "Job Lost" stage.
// Only the deal is changed — the quote itself is left untouched.
// =============================================

const { createClient } = require('@supabase/supabase-js');

// Deals still in these (pre-sale) stages are eligible to be marked lost
const OPEN_STAGES = ['new-lead', 'quotes', 'no-response', 'quote-sent'];
// Quote statuses that mean "sent but never accepted"
const UNANSWERED_STATUSES = ['sent', 'viewed', 'expired'];
const LOST_STAGE = 'job-lost';

exports.handler = async () => {
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  try {
    const { data: deals, error } = await supabase
      .from('jobs')
      .select('id, name, stage, internal_notes, quote:quotes!jobs_quote_id_fkey(id, quote_number, status, expires_at)')
      .in('stage', OPEN_STAGES)
      .not('quote_id', 'is', null);
    if (error) throw error;

    const now = new Date();
    const expired = (deals || []).filter(d =>
      d.quote &&
      d.quote.expires_at &&
      new Date(d.quote.expires_at) < now &&
      UNANSWERED_STATUSES.includes(d.quote.status)
    );

    let moved = 0;
    for (const deal of expired) {
      const stamp = now.toLocaleDateString('en-US', { timeZone: 'America/New_York' });
      const note = `[${stamp}] Auto-moved to Job Lost: quote ${deal.quote.quote_number || ''} expired ${new Date(deal.quote.expires_at).toLocaleDateString('en-US', { timeZone: 'America/New_York' })}.`.replace('  ', ' ');
      const { error: upErr } = await supabase
        .from('jobs')
        .update({
          stage: LOST_STAGE,
          internal_notes: deal.internal_notes ? `${deal.internal_notes}\n${note}` : note,
          updated_at: now.toISOString()
        })
        .eq('id', deal.id)
        .in('stage', OPEN_STAGES); // don't clobber a deal someone just moved
      if (upErr) console.error(`Failed to update deal ${deal.id}:`, upErr.message);
      else { moved++; console.log(`Moved "${deal.name}" (${deal.stage}) -> ${LOST_STAGE}`); }
    }

    console.log(`expire-quote-deals: checked ${deals?.length || 0}, moved ${moved}`);
    return { statusCode: 200, body: JSON.stringify({ checked: deals?.length || 0, moved }) };
  } catch (err) {
    console.error('expire-quote-deals error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
