const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

function formatTime(timeStr) {
  if (!timeStr) return '';
  const [h, m] = timeStr.split(':');
  const hour = parseInt(h);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 || 12;
  return `${hour12}:${m} ${ampm}`;
}

exports.handler = async (event) => {
  const headers = { 'Content-Type': 'application/json' };

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const { appointment_id, send_email, sync_gcal } = JSON.parse(event.body);

    if (!appointment_id) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'appointment_id required' }) };
    }

    // Load appointment with customer and type
    const { data: appt, error: apptErr } = await supabase
      .from('appointments')
      .select('*, customers(name, first_name, email, phone), appointment_types:appointment_type_id(name, icon, color)')
      .eq('id', appointment_id)
      .single();

    if (apptErr || !appt) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: 'Appointment not found' }) };
    }

    // Load company + notification settings
    const [companyRes, notifRes, schedRes] = await Promise.all([
      supabase.from('settings').select('value').eq('key', 'company').maybeSingle(),
      supabase.from('settings').select('value').eq('key', 'notifications').maybeSingle(),
      supabase.from('settings').select('value').eq('key', 'scheduling').maybeSingle()
    ]);

    const company = companyRes.data?.value || {};
    const notifications = notifRes.data?.value || {};
    const scheduling = schedRes.data?.value || {};
    const companyName = company.name || 'Homestead Cabinet Design';
    const fromEmail = company.from_email || company.email || 'noreply@homesteadcabinetdesign.com';
    const typeName = appt.appointment_types?.name || appt.title || 'Appointment';
    const typeIcon = appt.appointment_types?.icon || '';

    const results = { email_sent: false, gcal_synced: false };

    // Google Calendar sync
    if (sync_gcal && appt.appointment_date) {
      try {
        const { gcalRequest } = require('./gcal-utils');
        const timeZone = company.timezone || 'America/New_York';
        const customerName = appt.customers?.name || '';
        const description = customerName ? `Customer: ${customerName}\nEmail: ${appt.customers?.email || 'N/A'}\nPhone: ${appt.customers?.phone || 'N/A'}${appt.notes ? '\nNotes: ' + appt.notes : ''}` : (appt.notes || '');

        let eventBody;
        if (appt.appointment_time) {
          const slotDuration = scheduling.slot_duration || 60;
          const timePart = appt.appointment_time.substring(0, 5); // Normalize HH:MM:SS to HH:MM
          const startMinutes = parseInt(timePart.split(':')[0]) * 60 + parseInt(timePart.split(':')[1]);
          const endMinutes = startMinutes + slotDuration;
          const endTime = `${String(Math.floor(endMinutes / 60)).padStart(2, '0')}:${String(endMinutes % 60).padStart(2, '0')}`;
          eventBody = {
            summary: `${typeName}${customerName ? ' - ' + customerName : ''}`,
            start: { dateTime: `${appt.appointment_date}T${timePart}:00`, timeZone },
            end: { dateTime: `${appt.appointment_date}T${endTime}:00`, timeZone },
            description
          };
        } else {
          // All-day event when no time is set
          eventBody = {
            summary: `${typeName}${customerName ? ' - ' + customerName : ''}`,
            start: { date: appt.appointment_date },
            end: { date: appt.appointment_date },
            description
          };
        }

        const gcalEvent = await gcalRequest('POST', '/calendars/primary/events', eventBody);
        if (gcalEvent && gcalEvent.id) {
          await supabase.from('appointments').update({ gcal_event_id: gcalEvent.id }).eq('id', appointment_id);
          results.gcal_synced = true;
          console.log('GCal event created:', gcalEvent.id);
        }
      } catch (gcalErr) {
        console.error('GCal sync failed:', gcalErr.message);
        results.gcal_error = gcalErr.message;
      }
    }

    // Send customer confirmation email
    if (send_email && appt.customers?.email) {
      try {
        const formattedDate = formatDate(appt.appointment_date);
        const formattedTime = formatTime(appt.appointment_time);
        const host = (event.headers || {}).host || '';
        const baseUrl = host ? `https://${host}` : (process.env.SITE_URL || '');

        const isSiteVisit = /site|visit|estimate|home/i.test(typeName);
        const fullCompanyAddress = [company.address, company.city, company.state, company.zip].filter(Boolean).join(', ');
        const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullCompanyAddress)}`;

        const locationSection = isSiteVisit && fullCompanyAddress ? `
                <tr>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #f0f0f0;">
                    <div style="color: #666; font-size: 13px; margin-bottom: 4px;">Business Location</div>
                    <div style="color: #333; font-size: 15px;">
                      ${fullCompanyAddress}
                      <br><a href="${mapsUrl}" style="color: #667eea; text-decoration: none; font-size: 13px;">View on Google Maps &rarr;</a>
                    </div>
                  </td>
                </tr>` : '';

        const customerHtml = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; background-color: #f4f4f7; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f7; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px;">
          <tr>
            <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 30px; border-radius: 12px 12px 0 0; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 600;">${companyName}</h1>
            </td>
          </tr>
          <tr>
            <td style="background-color: #ffffff; padding: 40px 30px;">
              <h2 style="color: #333; margin: 0 0 8px 0; font-size: 22px; text-align: center;">Appointment Confirmed!</h2>
              <p style="color: #666; margin: 0 0 30px 0; text-align: center; font-size: 15px;">Your appointment has been scheduled. Here are the details:</p>
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
                  <td style="padding: 12px 16px;${locationSection ? ' border-bottom: 1px solid #f0f0f0;' : ''}">
                    <div style="color: #666; font-size: 13px; margin-bottom: 4px;">Time</div>
                    <div style="color: #333; font-size: 15px;">${formattedTime}</div>
                  </td>
                </tr>${locationSection}
              </table>
              <p style="color: #999; font-size: 13px; margin: 24px 0 0 0; text-align: center;">Need to make changes? <a href="${baseUrl}/schedule-manage.html?id=${appt.id}" style="color: #667eea; text-decoration: none;">Reschedule or Cancel</a></p>
            </td>
          </tr>
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

        const emailSubject = `Your ${typeName} Appointment Confirmation`;

        if (process.env.RESEND_API_KEY) {
          const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ from: `${companyName} <${fromEmail}>`, to: [appt.customers.email], subject: emailSubject, html: customerHtml })
          });
          if (res.ok) {
            results.email_sent = true;
            console.log('Confirmation email sent to:', appt.customers.email);
            await supabase.from('appointments').update({ confirmation_email_sent_at: new Date().toISOString() }).eq('id', appointment_id);
          }
          else { console.error('Resend error:', await res.text()); }
        } else if (process.env.SENDGRID_API_KEY) {
          const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${process.env.SENDGRID_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ personalizations: [{ to: [{ email: appt.customers.email }] }], from: { email: fromEmail, name: companyName }, subject: emailSubject, content: [{ type: 'text/html', value: customerHtml }] })
          });
          if (res.ok || res.status === 202) {
            results.email_sent = true;
            console.log('Confirmation email sent to:', appt.customers.email);
            await supabase.from('appointments').update({ confirmation_email_sent_at: new Date().toISOString() }).eq('id', appointment_id);
          }
          else { console.error('SendGrid error:', await res.text()); }
        }
      } catch (emailErr) {
        console.error('Failed to send confirmation email:', emailErr);
      }
    }

    // Send admin notification
    if (send_email && notifications.new_appointment !== false) {
      try {
        const notificationEmail = company.notification_email || company.email || process.env.ADMIN_EMAIL;
        if (notificationEmail) {
          const customerName = appt.customers?.name || 'Unknown';
          const emailSubject = `New Appointment: ${typeName} - ${customerName}`;
          let emailBody = `New appointment created!\n\n`;
          emailBody += `=== Appointment Details ===\n`;
          emailBody += `Type: ${typeName}\n`;
          emailBody += `Date: ${formatDate(appt.appointment_date)}\n`;
          emailBody += `Time: ${formatTime(appt.appointment_time)}\n`;
          emailBody += `\n=== Customer Information ===\n`;
          emailBody += `Name: ${customerName}\n`;
          emailBody += `Email: ${appt.customers?.email || 'N/A'}\n`;
          emailBody += `Phone: ${appt.customers?.phone || 'N/A'}\n`;
          if (appt.notes) { emailBody += `\n=== Notes ===\n${appt.notes}\n`; }
          emailBody += `\n---\nView this appointment in your admin dashboard.`;

          if (process.env.RESEND_API_KEY) {
            await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ from: `${companyName} <${fromEmail}>`, to: [notificationEmail], subject: emailSubject, text: emailBody })
            });
          } else if (process.env.SENDGRID_API_KEY) {
            await fetch('https://api.sendgrid.com/v3/mail/send', {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${process.env.SENDGRID_API_KEY}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ personalizations: [{ to: [{ email: notificationEmail }] }], from: { email: fromEmail, name: companyName }, subject: emailSubject, content: [{ type: 'text/plain', value: emailBody }] })
            });
          }
        }
      } catch (adminErr) {
        console.error('Failed to send admin notification:', adminErr);
      }
    }

    return { statusCode: 200, headers, body: JSON.stringify({ success: true, ...results }) };

  } catch (error) {
    console.error('Error:', error);
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
  }
};
