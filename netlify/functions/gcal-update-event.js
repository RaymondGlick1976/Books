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

  const { event_id: eventId, date, time, title } = event.queryStringParameters || {};
  if (!eventId || !date || !time) {
    return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: 'Missing event_id, date, or time' }) };
  }

  try {
    // Load company timezone
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { data: companySetting } = await supabase.from('settings').select('value').eq('key', 'company').maybeSingle();
    const company = companySetting?.value || {};
    const timeZone = company.timezone || 'America/New_York';

    // Default to 60 min duration
    const startMinutes = parseInt(time.split(':')[0]) * 60 + parseInt(time.split(':')[1]);
    const endMinutes = startMinutes + 60;
    const endHour = String(Math.floor(endMinutes / 60)).padStart(2, '0');
    const endMin = String(endMinutes % 60).padStart(2, '0');
    const endTime = `${endHour}:${endMin}`;

    const patch = {
      start: { dateTime: `${date}T${time}:00`, timeZone },
      end: { dateTime: `${date}T${endTime}:00`, timeZone }
    };
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

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };
}
