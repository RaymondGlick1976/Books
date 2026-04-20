// =============================================
// RETRY FAILED EMAILS - Scheduled function to retry failed email sends
// Runs every 15 minutes, retries up to 3 total attempts per email
// =============================================

const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  try {
    // Find failed emails that haven't exceeded max attempts (3)
    const { data: failedEmails, error: queryErr } = await supabase
      .from('email_logs')
      .select('id, to_email, subject, body, email_type, attempt_count')
      .eq('status', 'failed')
      .lt('attempt_count', 3)
      .order('sent_at', { ascending: true })
      .limit(10);

    if (queryErr) {
      console.error('Failed to query email_logs:', queryErr);
      return { statusCode: 500, body: JSON.stringify({ error: queryErr.message }) };
    }

    if (!failedEmails || failedEmails.length === 0) {
      return { statusCode: 200, body: JSON.stringify({ retried: 0, message: 'No failed emails to retry' }) };
    }

    // Load company settings for from email
    const { data: companySetting } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'company')
      .maybeSingle();

    const company = companySetting?.value || {};
    const companyName = company.name || 'Homestead Cabinet Design';
    const fromEmail = company.from_email || company.email || 'noreply@homesteadcabinetdesign.com';

    let retriedCount = 0;
    let successCount = 0;

    for (const email of failedEmails) {
      const newAttemptCount = (email.attempt_count || 1) + 1;
      let sent = false;
      let errorMsg = null;

      try {
        // Determine if body is HTML or plain text
        const isHtml = email.body && email.body.trim().startsWith('<');

        if (process.env.RESEND_API_KEY) {
          const payload = {
            from: `${companyName} <${fromEmail}>`,
            to: [email.to_email],
            subject: email.subject
          };
          if (isHtml) { payload.html = email.body; }
          else { payload.text = email.body; }

          const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
          });
          if (res.ok) {
            sent = true;
          } else {
            errorMsg = await res.text();
          }
        } else if (process.env.SENDGRID_API_KEY) {
          const contentType = isHtml ? 'text/html' : 'text/plain';
          const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${process.env.SENDGRID_API_KEY}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              personalizations: [{ to: [{ email: email.to_email }] }],
              from: { email: fromEmail, name: companyName },
              subject: email.subject,
              content: [{ type: contentType, value: email.body }]
            })
          });
          if (res.ok || res.status === 202) {
            sent = true;
          } else {
            errorMsg = await res.text();
          }
        } else {
          errorMsg = 'No email provider configured';
        }

        // Update the log record
        const updateData = {
          attempt_count: newAttemptCount,
          status: sent ? 'sent' : 'failed',
          error_message: sent ? null : errorMsg
        };
        if (sent) {
          updateData.sent_at = new Date().toISOString();
        }

        await supabase
          .from('email_logs')
          .update(updateData)
          .eq('id', email.id);

        if (sent) {
          console.log(`Retry success: ${email.to_email} (${email.email_type}, attempt ${newAttemptCount})`);
          successCount++;
        } else {
          console.error(`Retry failed: ${email.to_email} (attempt ${newAttemptCount}): ${errorMsg}`);
        }
        retriedCount++;
      } catch (retryErr) {
        console.error(`Retry error for email ${email.id}:`, retryErr);
        // Mark the attempt even if we errored
        await supabase
          .from('email_logs')
          .update({ attempt_count: newAttemptCount, error_message: retryErr.message })
          .eq('id', email.id);
      }
    }

    console.log(`Retry run complete: ${retriedCount} retried, ${successCount} succeeded`);
    return {
      statusCode: 200,
      body: JSON.stringify({ retried: retriedCount, succeeded: successCount })
    };

  } catch (err) {
    console.error('Retry failed emails error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
