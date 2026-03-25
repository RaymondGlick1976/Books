// =============================================
// GOOGLE CALENDAR DELETE EVENT
// =============================================

const { gcalRequest } = require('./gcal-utils');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders(), body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders(), body: 'Method not allowed' };
  }

  const eventId = event.queryStringParameters?.event_id;
  if (!eventId) {
    return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: 'Missing event_id' }) };
  }

  try {
    await gcalRequest('DELETE', `/calendars/primary/events/${eventId}`);
    return {
      statusCode: 200,
      headers: corsHeaders(),
      body: JSON.stringify({ success: true })
    };
  } catch (err) {
    console.error('GCal delete event error:', err);
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
