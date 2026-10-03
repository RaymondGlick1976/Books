// =============================================
// SEND SEQUENCE EMAILS - runs every 15 minutes (see netlify.toml)
// Sends due rows from scheduled_emails and performs stage auto-advances.
// Rows are queued by the jobs trigger when a deal enters a stage
// (database/migration-email-sequences.sql).
// =============================================

const { createClient } = require('@supabase/supabase-js');
const { EmailBlocks, loadBrand, buildVars, unsubscribeUrl, sendEmail, DEAL_SELECT } = require('./sequence-utils');

const BATCH = 40;

exports.handler = async () => {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const now = new Date();
  const summary = { sent: 0, advanced: 0, skipped: 0, failed: 0 };

  try {
    // Rows stuck in 'sending' (function crashed mid-run) are marked failed rather
    // than retried, so a customer never gets the same email twice.
    await supabase.from('scheduled_emails')
      .update({ status: 'failed', status_reason: 'Interrupted while sending' })
      .eq('status', 'sending')
      .lt('send_at', new Date(now.getTime() - 60 * 60 * 1000).toISOString());

    const { data: due, error } = await supabase
      .from('scheduled_emails')
      .select('id')
      .eq('status', 'pending')
      .lte('send_at', now.toISOString())
      .order('send_at')
      .limit(BATCH);
    if (error) throw error;
    if (!due || due.length === 0) {
      return { statusCode: 200, body: JSON.stringify({ ...summary, message: 'Nothing due' }) };
    }

    // Claim the rows so an overlapping run can't send them too
    const { data: claimed, error: claimErr } = await supabase
      .from('scheduled_emails')
      .update({ status: 'sending' })
      .in('id', due.map(r => r.id))
      .eq('status', 'pending')
      .select(`id, kind, deal_id, customer_id, stage_id, advance_to_stage, sequence_id,
               step:sequence_steps(id, subject, preheader, style, blocks, is_active),
               sequence:email_sequences(id, is_active)`);
    if (claimErr) throw claimErr;

    const { brand, fromEmail, replyTo } = await loadBrand(supabase);

    const finish = (id, fields) => supabase.from('scheduled_emails').update(fields).eq('id', id);

    for (const row of claimed || []) {
      try {
        const { data: deal } = await supabase.from('jobs').select(DEAL_SELECT).eq('id', row.deal_id).maybeSingle();

        if (!deal || deal.stage !== row.stage_id) {
          await finish(row.id, { status: 'cancelled', status_reason: 'Deal is no longer in this stage' });
          summary.skipped++;
          continue;
        }
        if (deal.automations_off) {
          await finish(row.id, { status: 'cancelled', status_reason: 'Automations turned off for this deal' });
          summary.skipped++;
          continue;
        }
        if (row.sequence && !row.sequence.is_active) {
          await finish(row.id, { status: 'cancelled', status_reason: 'Sequence turned off' });
          summary.skipped++;
          continue;
        }

        // ---- Stage auto-advance ----
        if (row.kind === 'advance') {
          const { error: upErr } = await supabase.from('jobs')
            .update({ stage: row.advance_to_stage, updated_at: new Date().toISOString() })
            .eq('id', deal.id)
            .eq('stage', row.stage_id);
          if (upErr) throw upErr;
          await finish(row.id, { status: 'sent', sent_at: new Date().toISOString(), status_reason: `Moved to ${row.advance_to_stage}` });
          summary.advanced++;
          continue;
        }

        // ---- Email ----
        const customer = deal.customer || {};
        if (!row.step || !row.step.is_active) {
          await finish(row.id, { status: 'cancelled', status_reason: 'Email removed or turned off' });
          summary.skipped++;
          continue;
        }
        if (!customer.email) {
          await finish(row.id, { status: 'skipped', status_reason: 'Customer has no email' });
          summary.skipped++;
          continue;
        }
        if (customer.disable_drips) {
          await finish(row.id, { status: 'cancelled', status_reason: 'Customer opted out' });
          summary.skipped++;
          continue;
        }

        const unsub = unsubscribeUrl(customer.unsubscribe_token);
        const rendered = EmailBlocks.renderEmail(row.step, {
          vars: buildVars(deal, brand),
          brand,
          unsubscribeUrl: unsub
        });
        if (!rendered.subject) {
          await finish(row.id, { status: 'failed', status_reason: 'Email has no subject' });
          summary.failed++;
          continue;
        }

        let sendError = null;
        try {
          await sendEmail({
            to: customer.email,
            subject: rendered.subject,
            html: rendered.html,
            text: rendered.text,
            fromEmail,
            fromName: brand.name,
            replyTo,
            unsubscribe: unsub
          });
        } catch (e) {
          sendError = e.message;
        }

        // Log in email_logs like every other email (failed ones are retried by retry-failed-emails)
        const { data: log } = await supabase.from('email_logs').insert({
          customer_id: customer.id,
          deal_id: deal.id,
          to_email: customer.email,
          subject: rendered.subject,
          body: rendered.html,
          status: sendError ? 'failed' : 'sent',
          error_message: sendError,
          attempt_count: 1,
          email_type: 'sequence'
        }).select('id').maybeSingle();

        await finish(row.id, {
          status: sendError ? 'failed' : 'sent',
          status_reason: sendError,
          sent_at: sendError ? null : new Date().toISOString(),
          email_log_id: log?.id || null
        });
        sendError ? summary.failed++ : summary.sent++;
      } catch (rowErr) {
        console.error('[sequence] row failed', row.id, rowErr);
        await finish(row.id, { status: 'failed', status_reason: String(rowErr.message || rowErr).slice(0, 500) });
        summary.failed++;
      }
    }

    console.log('[sequence] run complete', summary);
    return { statusCode: 200, body: JSON.stringify(summary) };
  } catch (err) {
    console.error('[sequence] run error', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message, ...summary }) };
  }
};
