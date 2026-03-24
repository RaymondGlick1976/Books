const { createClient } = require('@supabase/supabase-js');

// Helper: convert "HH:MM" to total minutes
function timeToMinutes(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

// Helper: check if two time slots overlap (with buffer on both sides)
function slotsOverlap(start1, dur1, start2, dur2, buffer) {
  const s1 = timeToMinutes(start1);
  const e1 = s1 + dur1;
  const s2 = timeToMinutes(start2);
  const e2 = s2 + dur2;
  // Add buffer to both sides
  return (s1 < e2 + buffer) && (s2 < e1 + buffer);
}

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

// Convert old-format type config to new schedule format, resolving global defaults
function normalizeTypeConfig(typeConfig, globalDefaults) {
  const g = globalDefaults || {};
  const slot_duration = typeConfig.slot_duration || 60;
  const buffer_minutes = typeConfig.buffer_minutes || 15;
  const lead_time_hours = (typeConfig.lead_time_hours != null ? typeConfig.lead_time_hours : null) ?? g.lead_time_hours ?? 24;
  const max_advance_days = (typeConfig.max_advance_days != null ? typeConfig.max_advance_days : null) ?? g.max_advance_days ?? 60;

  let schedule;
  if (typeConfig.schedule) {
    schedule = typeConfig.schedule;
  } else if (typeConfig.days) {
    const start = typeConfig.start_time || '09:00';
    const end = typeConfig.end_time || '17:00';
    schedule = {};
    for (let d = 1; d <= 7; d++) {
      schedule[String(d)] = typeConfig.days.includes(d) ? [{ start, end }] : [];
    }
  } else {
    schedule = {};
    for (let d = 1; d <= 7; d++) {
      schedule[String(d)] = d <= 5 ? [{ start: '09:00', end: '17:00' }] : [];
    }
  }

  return { slot_duration, buffer_minutes, lead_time_hours, max_advance_days, schedule };
}

// Helper: format time for display
function formatTime(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 || 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${ampm}`;
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    'Content-Type': 'application/json'
  };

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const data = JSON.parse(event.body);

    // 1. Validate required fields
    if (!data.type_id || !data.date || !data.time || !data.first_name || !data.last_name || !data.email) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Missing required fields: type_id, date, time, first_name, last_name, and email are required' })
      };
    }

    // 2. Load settings and appointment type in parallel
    const [schedulingResult, typeResult, companyResult, notificationsResult] = await Promise.all([
      supabase.from('settings').select('value').eq('key', 'scheduling').maybeSingle(),
      supabase.from('appointment_types').select('*').eq('id', data.type_id).single(),
      supabase.from('settings').select('value').eq('key', 'company').maybeSingle(),
      supabase.from('settings').select('value').eq('key', 'notifications').maybeSingle()
    ]);

    const scheduling = schedulingResult.data?.value || {};
    const appointmentType = typeResult.data;
    const company = companyResult.data?.value || {};
    const notifications = notificationsResult.data?.value || {};

    if (!appointmentType) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'Appointment type not found' })
      };
    }

    const typeConfig = (scheduling.types && scheduling.types[data.type_id]) || {};
    const config = normalizeTypeConfig(typeConfig, scheduling.global);

    // 3. Server-side slot collision detection

    // Check blocked dates
    const blockedDates = scheduling.blocked_dates || [];
    if (blockedDates.includes(data.date)) {
      return {
        statusCode: 409,
        headers,
        body: JSON.stringify({ error: 'This date is not available for scheduling' })
      };
    }

    // Check blocked time ranges
    const blockedTimes = scheduling.blocked_times || [];
    const slotStartMin = timeToMinutes(data.time);
    const slotEndMin = slotStartMin + config.slot_duration;
    const overlapsBlockedTime = blockedTimes.some(bt => {
      if (bt.date !== data.date) return false;
      const btStart = timeToMinutes(bt.start);
      const btEnd = timeToMinutes(bt.end);
      return slotStartMin < btEnd && slotEndMin > btStart;
    });
    if (overlapsBlockedTime) {
      return {
        statusCode: 409,
        headers,
        body: JSON.stringify({ error: 'This time slot is blocked and not available for scheduling' })
      };
    }

    // Check day-of-week is allowed (using schedule windows)
    const jsDay = new Date(data.date + 'T12:00:00').getDay(); // use noon to avoid timezone edge issues
    const dayOfWeek = jsDay === 0 ? 7 : jsDay; // Convert JS Sunday=0 to ISO Sunday=7
    const dayWindows = config.schedule[String(dayOfWeek)] || [];
    if (dayWindows.length === 0) {
      return {
        statusCode: 409,
        headers,
        body: JSON.stringify({ error: 'Appointments are not available on this day of the week' })
      };
    }

    // Check time fits within at least one of the day's windows
    const slotStart = timeToMinutes(data.time);
    const slotEnd = slotStart + config.slot_duration;
    const fitsWindow = dayWindows.some(w => {
      return slotStart >= timeToMinutes(w.start) && slotEnd <= timeToMinutes(w.end);
    });
    if (!fitsWindow) {
      return {
        statusCode: 409,
        headers,
        body: JSON.stringify({ error: 'This time is outside of available business hours' })
      };
    }

    // Check lead time
    const now = new Date();
    const appointmentDateTime = new Date(`${data.date}T${data.time}:00`);
    const hoursUntilAppt = (appointmentDateTime - now) / (1000 * 60 * 60);
    if (hoursUntilAppt < config.lead_time_hours) {
      return {
        statusCode: 409,
        headers,
        body: JSON.stringify({ error: `Appointments must be booked at least ${config.lead_time_hours} hours in advance` })
      };
    }

    // Check max advance days
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const appointmentDate = new Date(data.date + 'T00:00:00');
    const daysUntilAppt = (appointmentDate - today) / (1000 * 60 * 60 * 24);
    if (daysUntilAppt > config.max_advance_days) {
      return {
        statusCode: 409,
        headers,
        body: JSON.stringify({ error: `Appointments cannot be booked more than ${config.max_advance_days} days in advance` })
      };
    }

    // Cross-type overlap detection: fetch ALL appointments for this date
    const { data: existingAppts } = await supabase
      .from('appointments')
      .select('appointment_time, appointment_type_id')
      .eq('appointment_date', data.date)
      .neq('status', 'cancelled');

    const apptList = existingAppts || [];
    for (const existing of apptList) {
      const existingTypeConfig = (scheduling.types && scheduling.types[existing.appointment_type_id]) || {};
      const existingDuration = existingTypeConfig.slot_duration || 60;

      if (slotsOverlap(data.time, config.slot_duration, existing.appointment_time, existingDuration, config.buffer_minutes)) {
        return {
          statusCode: 409,
          headers,
          body: JSON.stringify({ error: 'This time slot is no longer available' })
        };
      }
    }

    // 4. Customer upsert
    let customerId;
    const { data: existingCustomer } = await supabase
      .from('customers')
      .select('id')
      .eq('email', data.email.toLowerCase())
      .single();

    if (existingCustomer) {
      customerId = existingCustomer.id;
    } else {
      const { data: newCustomer, error: custError } = await supabase
        .from('customers')
        .insert([{
          name: `${data.first_name} ${data.last_name}`,
          email: data.email.toLowerCase(),
          phone: data.phone || null,
          lead_source: 'Online Scheduling'
        }])
        .select()
        .single();

      if (custError) throw custError;
      customerId = newCustomer.id;
    }

    // 5. Create appointment
    const typeName = appointmentType.name;
    const { data: appt, error: apptError } = await supabase
      .from('appointments')
      .insert([{
        appointment_type_id: data.type_id,
        title: `${typeName} - ${data.first_name} ${data.last_name}`,
        appointment_date: data.date,
        appointment_time: data.time,
        customer_id: customerId,
        location: '',
        notes: data.notes || ''
      }])
      .select()
      .single();

    if (apptError) throw apptError;

    // 5b. Create Google Calendar event (don't fail booking if GCal fails)
    try {
      const { gcalRequest } = require('./gcal-utils');
      const apptDateTime = new Date(`${data.date}T${data.time}:00`);
      const endDateTime = new Date(apptDateTime.getTime() + config.slot_duration * 60 * 1000);

      const eventBody = {
        summary: `${typeName} - ${data.first_name} ${data.last_name}`,
        start: { dateTime: apptDateTime.toISOString() },
        end: { dateTime: endDateTime.toISOString() },
        description: `Customer: ${data.first_name} ${data.last_name}\nEmail: ${data.email}\nPhone: ${data.phone || 'N/A'}${data.notes ? '\nNotes: ' + data.notes : ''}`
      };

      const gcalEvent = await gcalRequest('POST', '/calendars/primary/events', eventBody);
      if (gcalEvent && gcalEvent.id) {
        await supabase
          .from('appointments')
          .update({ gcal_event_id: gcalEvent.id })
          .eq('id', appt.id);
        console.log('GCal event created:', gcalEvent.id);
      }
    } catch (gcalErr) {
      // Don't fail the booking if GCal sync fails
      console.error('Failed to create GCal event:', gcalErr.message);
    }

    // 6. Send customer HTML confirmation email
    try {
      const companyName = company.name || 'Homestead Cabinet Design';
      const fromEmail = company.email || 'noreply@homesteadcabinetdesign.com';
      const formattedDate = formatDate(data.date);
      const formattedTime = formatTime(data.time);

      // Derive base URL for manage link
      const host = (event.headers || {}).host || (event.headers || {}).Host || '';
      const baseUrl = host ? `https://${host}` : '';

      // Check if this is a site visit type
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
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 30px; border-radius: 12px 12px 0 0; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 600;">${companyName}</h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="background-color: #ffffff; padding: 40px 30px;">
              <h2 style="color: #333; margin: 0 0 8px 0; font-size: 22px; text-align: center;">Appointment Confirmed!</h2>
              <p style="color: #666; margin: 0 0 30px 0; text-align: center; font-size: 15px;">Your appointment has been scheduled. Here are the details:</p>
              <!-- Details Card -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f9fafb; border-radius: 8px; border: 1px solid #e5e7eb;">
                <tr>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #f0f0f0;">
                    <div style="color: #666; font-size: 13px; margin-bottom: 4px;">Appointment Type</div>
                    <div style="color: #333; font-size: 15px;">${appointmentType.icon ? appointmentType.icon + ' ' : ''}${typeName}</div>
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

      if (process.env.RESEND_API_KEY) {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from: `${companyName} <${fromEmail}>`,
            to: [data.email],
            subject: `Your ${typeName} Appointment Confirmation`,
            html: customerHtml
          })
        });
        console.log('Customer confirmation email sent to:', data.email);
      } else if (process.env.SENDGRID_API_KEY) {
        await fetch('https://api.sendgrid.com/v3/mail/send', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.SENDGRID_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            personalizations: [{ to: [{ email: data.email }] }],
            from: { email: fromEmail, name: companyName },
            subject: `Your ${typeName} Appointment Confirmation`,
            content: [{ type: 'text/html', value: customerHtml }]
          })
        });
        console.log('Customer confirmation email sent to:', data.email);
      } else {
        console.log('No email provider configured. Would send confirmation to:', data.email);
      }
    } catch (emailErr) {
      // Don't fail the booking if customer email fails
      console.error('Failed to send customer confirmation email:', emailErr);
    }

    // 7. Send admin notification email
    try {
      if (notifications.new_appointment !== false) {
        const companyName = company.name || 'Homestead Cabinet Design';
        const fromEmail = company.email || 'noreply@homesteadcabinetdesign.com';
        const notificationEmail = company.notification_email || company.email || process.env.ADMIN_EMAIL;

        if (notificationEmail) {
          const emailSubject = `New Online Appointment: ${typeName} - ${data.first_name} ${data.last_name}`;

          let emailBody = `New online appointment booked!\n\n`;
          emailBody += `=== Appointment Details ===\n`;
          emailBody += `Type: ${typeName}\n`;
          emailBody += `Date: ${formatDate(data.date)}\n`;
          emailBody += `Time: ${formatTime(data.time)}\n`;
          emailBody += `\n=== Customer Information ===\n`;
          emailBody += `Name: ${data.first_name} ${data.last_name}\n`;
          emailBody += `Email: ${data.email}\n`;
          emailBody += `Phone: ${data.phone || 'Not provided'}\n`;
          if (data.notes) {
            emailBody += `\n=== Notes ===\n`;
            emailBody += `${data.notes}\n`;
          }
          emailBody += `\nSubmitted: ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })}\n`;
          emailBody += `\n---\nView this appointment in your admin dashboard.`;

          if (process.env.RESEND_API_KEY) {
            await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                from: `${companyName} <${fromEmail}>`,
                to: [notificationEmail],
                subject: emailSubject,
                text: emailBody
              })
            });
            console.log('Admin notification email sent to:', notificationEmail);
          } else if (process.env.SENDGRID_API_KEY) {
            await fetch('https://api.sendgrid.com/v3/mail/send', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${process.env.SENDGRID_API_KEY}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                personalizations: [{ to: [{ email: notificationEmail }] }],
                from: { email: fromEmail, name: companyName },
                subject: emailSubject,
                content: [{ type: 'text/plain', value: emailBody }]
              })
            });
            console.log('Admin notification email sent to:', notificationEmail);
          } else {
            console.log('No email provider configured. Would send admin notification to:', notificationEmail);
          }
        } else {
          console.log('No admin notification email configured');
        }
      } else {
        console.log('New appointment notifications disabled');
      }
    } catch (emailErr) {
      // Don't fail the booking if admin email fails
      console.error('Failed to send admin notification email:', emailErr);
    }

    // 8. Return success
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        appointment_id: appt.id,
        appointment: {
          date: data.date,
          time: data.time,
          type: typeName,
          type_icon: appointmentType.icon
        }
      })
    };

  } catch (err) {
    console.error('Schedule book error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Failed to book appointment: ' + err.message })
    };
  }
};
