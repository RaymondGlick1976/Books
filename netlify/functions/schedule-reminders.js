// =============================================
// SCHEDULE REMINDERS - Hourly cron to send reminder emails
// =============================================

const { createClient } = require('@supabase/supabase-js');

// Helper: format date for display
function formatDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

// Helper: format time for display
function formatTime(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 || 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${ampm}`;
}

exports.handler = async (event) => {
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  try {
    // 1. Load notification + scheduling settings
    const [notifResult, schedulingResult] = await Promise.all([
      supabase.from('settings').select('value').eq('key', 'notifications').maybeSingle(),
      supabase.from('settings').select('value').eq('key', 'scheduling').maybeSingle()
    ]);

    const notifications = notifResult.data?.value || {};
    const scheduling = schedulingResult.data?.value || {};
    const globalReminderHours = notifications.reminder_hours;

    // If global reminder_hours is 0/null/undefined AND no per-type overrides exist, skip
    const typeConfigs = scheduling.types || {};
    const hasAnyTypeReminder = Object.values(typeConfigs).some(tc => tc.reminder_hours != null && tc.reminder_hours > 0);
    if (!globalReminderHours && !hasAnyTypeReminder) {
      console.log('Appointment reminders disabled (no global or per-type reminder configured)');
      return { statusCode: 200, body: JSON.stringify({ sent: 0, message: 'Reminders disabled' }) };
    }

    // 2. Find the max possible reminder window across all configs
    const allReminderHours = [globalReminderHours || 0];
    Object.values(typeConfigs).forEach(tc => {
      if (tc.reminder_hours != null) allReminderHours.push(tc.reminder_hours);
    });
    const maxReminderHours = Math.max(...allReminderHours);

    const now = new Date();
    const windowEnd = new Date(now.getTime() + maxReminderHours * 60 * 60 * 1000);

    // Query appointments in the broadest possible window
    const nowDate = now.toISOString().split('T')[0];
    const endDate = windowEnd.toISOString().split('T')[0];

    const { data: appointments, error: apptErr } = await supabase
      .from('appointments')
      .select('id, appointment_date, appointment_time, appointment_type_id, customer_id, customers(name, email), appointment_types(name, icon)')
      .eq('status', 'scheduled')
      .is('reminder_sent_at', null)
      .gte('appointment_date', nowDate)
      .lte('appointment_date', endDate);

    if (apptErr) {
      console.error('Failed to query appointments:', apptErr);
      return { statusCode: 500, body: JSON.stringify({ error: apptErr.message }) };
    }

    if (!appointments || appointments.length === 0) {
      console.log('No appointments need reminders');
      return { statusCode: 200, body: JSON.stringify({ sent: 0 }) };
    }

    // 3. Filter: each appointment uses its type-specific reminder_hours, falling back to global
    const eligible = appointments.filter(appt => {
      const typeCfg = typeConfigs[appt.appointment_type_id] || {};
      const hours = typeCfg.reminder_hours != null ? typeCfg.reminder_hours : globalReminderHours;
      if (!hours) return false; // reminders disabled for this type

      const apptDateTime = new Date(`${appt.appointment_date}T${appt.appointment_time}:00`);
      const typeWindowEnd = new Date(now.getTime() + hours * 60 * 60 * 1000);
      return apptDateTime > now && apptDateTime <= typeWindowEnd;
    });

    if (eligible.length === 0) {
      console.log('No appointments in reminder window');
      return { statusCode: 200, body: JSON.stringify({ sent: 0 }) };
    }

    // 4. Load company settings for email from/name
    const { data: companySetting } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'company')
      .maybeSingle();

    const company = companySetting?.value || {};
    const companyName = company.name || 'Homestead Cabinet Design';
    const fromEmail = company.from_email || company.email || 'noreply@homesteadcabinetdesign.com';
    const siteUrl = process.env.SITE_URL || 'https://hcdbooks.netlify.app';

    let sentCount = 0;

    // 5. Send reminder for each eligible appointment
    for (const appt of eligible) {
      const customerEmail = appt.customers?.email;
      const customerName = appt.customers?.name || 'Customer';
      const typeName = appt.appointment_types?.name || 'Appointment';
      const typeIcon = appt.appointment_types?.icon || '';

      if (!customerEmail) {
        console.log(`Skipping appointment ${appt.id} - no customer email`);
        continue;
      }

      const formattedDate = formatDate(appt.appointment_date);
      const formattedTime = formatTime(appt.appointment_time);
      const manageUrl = `${siteUrl}/schedule-manage.html?id=${appt.id}`;

      const reminderHtml = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; background-color: #f4f4f7; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f7; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px;">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #4a7223 0%, #38571a 100%); padding: 40px 30px; border-radius: 12px 12px 0 0; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 600;">${companyName}</h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="background-color: #ffffff; padding: 40px 30px;">
              <h2 style="color: #333; margin: 0 0 8px 0; font-size: 22px; text-align: center;">Appointment Reminder</h2>
              <p style="color: #666; margin: 0 0 30px 0; text-align: center; font-size: 15px;">Hi ${customerName.split(' ')[0]}, this is a friendly reminder about your upcoming appointment.</p>
              <!-- Details Card -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f9fafb; border-radius: 8px; border: 1px solid #e5e7eb;">
                <tr>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #f0f0f0;">
                    <div style="color: #666; font-size: 13px; margin-bottom: 4px;">Appointment Type</div>
                    <div style="color: #333; font-size: 15px;">${typeIcon ? typeIcon + ' ' : ''}${typeName}</div>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #f0f0f0;">
                    <div style="color: #666; font-size: 13px; margin-bottom: 4px;">Date</div>
                    <div style="color: #333; font-size: 15px;">${formattedDate}</div>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 12px 16px;">
                    <div style="color: #666; font-size: 13px; margin-bottom: 4px;">Time</div>
                    <div style="color: #333; font-size: 15px;">${formattedTime}</div>
                  </td>
                </tr>
              </table>
              <p style="color: #999; font-size: 13px; margin: 24px 0 0 0; text-align: center;">Need to make changes? <a href="${manageUrl}" style="color: #38571a; text-decoration: none;">Reschedule or Cancel</a></p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding: 20px 30px; text-align: center; border-top: 1px solid #eee;">
              <p style="color: #999; margin: 0; font-size: 13px;">&copy; ${new Date().getFullYear()} ${companyName}. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

      try {
        let sent = false;

        if (process.env.RESEND_API_KEY) {
          const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              from: `${companyName} <${fromEmail}>`,
              to: [customerEmail],
              subject: `Reminder: Your ${typeName} Appointment`,
              html: reminderHtml
            })
          });
          if (res.ok) {
            sent = true;
          } else {
            const errText = await res.text();
            console.error(`Resend error for appointment ${appt.id}:`, errText);
          }
        } else if (process.env.SENDGRID_API_KEY) {
          const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${process.env.SENDGRID_API_KEY}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              personalizations: [{ to: [{ email: customerEmail }] }],
              from: { email: fromEmail, name: companyName },
              subject: `Reminder: Your ${typeName} Appointment`,
              content: [{ type: 'text/html', value: reminderHtml }]
            })
          });
          if (res.ok || res.status === 202) {
            sent = true;
          } else {
            const errText = await res.text();
            console.error(`SendGrid error for appointment ${appt.id}:`, errText);
          }
        } else {
          console.log(`No email provider configured. Would send reminder to: ${customerEmail}`);
        }

        // Only mark reminder as sent if email was actually delivered
        if (sent) {
          await supabase
            .from('appointments')
            .update({ reminder_sent_at: new Date().toISOString() })
            .eq('id', appt.id);
          console.log(`Reminder sent to ${customerEmail} for appointment ${appt.id}`);
          sentCount++;
        }
      } catch (emailErr) {
        console.error(`Failed to send reminder for appointment ${appt.id}:`, emailErr);
      }
    }

    console.log(`Reminder run complete: ${sentCount} reminders sent`);
    return { statusCode: 200, body: JSON.stringify({ sent: sentCount }) };

  } catch (err) {
    console.error('Schedule reminders error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
