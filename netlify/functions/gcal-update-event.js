// =============================================
// GOOGLE CALENDAR UPDATE EVENT
// =============================================

const { createClient } = require('@supabase/supabase-js');
const { gcalRequest } = require('./gcal-utils');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders(), body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders(), body: 'Method not allowed' };
  }

  const { event_id: eventId, date, end_date: endDate, time, title } = event.queryStringParameters || {};
  if (!eventId || !date) {
    return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: 'Missing event_id or date' }) };
  }

  try {
    // Load company timezone
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { data: companySetting } = await supabase.from('settings').select('value').eq('key', 'company').maybeSingle();
    const company = companySetting?.value || {};
    const timeZone = company.timezone || 'America/New_York';

    const isMultiDay = !!endDate && endDate > date;
    let patch;
    if (isMultiDay || !time) {
      // All-day event (single day with no time, or a multi-day range).
      // Google's all-day end date is exclusive, so it is the day after the last day.
      // dateTime/timeZone are nulled so a previously timed event converts cleanly.
      patch = {
        start: { date, dateTime: null, timeZone: null },
        end: { date: addDays(isMultiDay ? endDate : date, 1), dateTime: null, timeZone: null }
      };
    } else {
      // Default to 60 min duration
      const timePart = time.substring(0, 5); // Normalize HH:MM:SS to HH:MM
      const startMinutes = parseInt(timePart.split(':')[0]) * 60 + parseInt(timePart.split(':')[1]);
      const endMinutes = startMinutes + 60;
      const endHour = String(Math.floor(endMinutes / 60)).padStart(2, '0');
      const endMin = String(endMinutes % 60).padStart(2, '0');
      const endTime = `${endHour}:${endMin}`;

      patch = {
        start: { dateTime: `${date}T${timePart}:00`, timeZone, date: null },
        end: { dateTime: `${date}T${endTime}:00`, timeZone, date: null }
      };
    }
    if (title) patch.summary = title;

    await gcalRequest('PATCH', `/calendars/primary/events/${eventId}`, patch);

    return {
      statusCode: 200,
      headers: corsHeaders(),
      body: JSON.stringify({ success: true })
    };
  } catch (err) {
    console.error('GCal update event error:', err);
    return {
      statusCode: 200,
      headers: corsHeaders(),
      body: JSON.stringify({ success: false, error: err.message })
    };
  }
};

// Add days to a YYYY-MM-DD string without timezone drift
function addDays(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().split('T')[0];
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };
}
