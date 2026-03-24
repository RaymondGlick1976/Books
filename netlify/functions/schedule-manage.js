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
  return (s1 < e2 + buffer) && (s2 < e1 + buffer);
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

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const params = event.queryStringParameters || {};
    const action = params.action;

    // -------------------------------------------------------
    // GET — Load appointment details
    // -------------------------------------------------------
    if (event.httpMethod === 'GET') {
      const id = params.id;
      if (!id) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing appointment id' }) };
      }

      const { data: appt, error } = await supabase
        .from('appointments')
        .select('id, appointment_date, appointment_time, appointment_type_id, customer_id, status, gcal_event_id, customers(name), appointment_types(name, icon)')
        .eq('id', id)
        .eq('status', 'scheduled')
        .single();

      if (error || !appt) {
        return { statusCode: 404, headers, body: JSON.stringify({ error: 'Appointment not found or already cancelled' }) };
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          id: appt.id,
          date: appt.appointment_date,
          time: appt.appointment_time,
          appointment_type_id: appt.appointment_type_id,
          type_name: appt.appointment_types?.name,
          type_icon: appt.appointment_types?.icon,
          customer_name: appt.customers?.name
        })
      };
    }

    // -------------------------------------------------------
    // POST — Cancel or Reschedule
    // -------------------------------------------------------
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
    }

    const data = JSON.parse(event.body);

    if (!data.id) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing appointment id' }) };
    }

    // Verify appointment exists and is scheduled
    const { data: existing, error: existErr } = await supabase
      .from('appointments')
      .select('id, appointment_date, appointment_time, appointment_type_id, gcal_event_id, customers(name)')
      .eq('id', data.id)
      .eq('status', 'scheduled')
      .single();

    if (existErr || !existing) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: 'Appointment not found or already cancelled' }) };
    }

    // ---------- Cancel ----------
    if (action === 'cancel') {
      const { error: updateErr } = await supabase
        .from('appointments')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', data.id);

      if (updateErr) throw updateErr;

      // Delete GCal event if exists
      if (existing.gcal_event_id) {
        try {
          const { gcalRequest } = require('./gcal-utils');
          await gcalRequest('DELETE', `/calendars/primary/events/${existing.gcal_event_id}`);
          console.log('GCal event deleted:', existing.gcal_event_id);
        } catch (gcalErr) {
          console.error('Failed to delete GCal event:', gcalErr.message);
        }
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true })
      };
    }

    // ---------- Reschedule ----------
    if (action === 'reschedule') {
      if (!data.date || !data.time) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing date or time' }) };
      }

      // Load scheduling settings and appointment type
      const [schedulingResult, typeResult] = await Promise.all([
        supabase.from('settings').select('value').eq('key', 'scheduling').maybeSingle(),
        supabase.from('appointment_types').select('*').eq('id', existing.appointment_type_id).single()
      ]);

      const scheduling = schedulingResult.data?.value || {};
      const appointmentType = typeResult.data;

      if (!appointmentType) {
        return { statusCode: 404, headers, body: JSON.stringify({ error: 'Appointment type not found' }) };
      }

      const typeConfig = (scheduling.types && scheduling.types[existing.appointment_type_id]) || {};
      const config = normalizeTypeConfig(typeConfig, scheduling.global);

      // Check blocked dates
      const blockedDates = scheduling.blocked_dates || [];
      if (blockedDates.includes(data.date)) {
        return { statusCode: 409, headers, body: JSON.stringify({ error: 'This date is not available for scheduling' }) };
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
        return { statusCode: 409, headers, body: JSON.stringify({ error: 'This time slot is blocked and not available' }) };
      }

      // Check day-of-week
      const jsDay = new Date(data.date + 'T12:00:00').getDay();
      const dayOfWeek = jsDay === 0 ? 7 : jsDay;
      const dayWindows = config.schedule[String(dayOfWeek)] || [];
      if (dayWindows.length === 0) {
        return { statusCode: 409, headers, body: JSON.stringify({ error: 'Appointments are not available on this day' }) };
      }

      // Check time fits within a window
      const slotStart = timeToMinutes(data.time);
      const slotEnd = slotStart + config.slot_duration;
      const fitsWindow = dayWindows.some(w => slotStart >= timeToMinutes(w.start) && slotEnd <= timeToMinutes(w.end));
      if (!fitsWindow) {
        return { statusCode: 409, headers, body: JSON.stringify({ error: 'This time is outside of available business hours' }) };
      }

      // Check lead time
      const now = new Date();
      const appointmentDateTime = new Date(`${data.date}T${data.time}:00`);
      const hoursUntilAppt = (appointmentDateTime - now) / (1000 * 60 * 60);
      if (hoursUntilAppt < config.lead_time_hours) {
        return { statusCode: 409, headers, body: JSON.stringify({ error: `Appointments must be booked at least ${config.lead_time_hours} hours in advance` }) };
      }

      // Check max advance days
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const appointmentDate = new Date(data.date + 'T00:00:00');
      const daysUntilAppt = (appointmentDate - today) / (1000 * 60 * 60 * 24);
      if (daysUntilAppt > config.max_advance_days) {
        return { statusCode: 409, headers, body: JSON.stringify({ error: `Appointments cannot be booked more than ${config.max_advance_days} days in advance` }) };
      }

      // Slot collision (exclude current appointment and cancelled)
      const { data: existingAppts } = await supabase
        .from('appointments')
        .select('appointment_time, appointment_type_id')
        .eq('appointment_date', data.date)
        .neq('status', 'cancelled')
        .neq('id', data.id);

      const apptList = existingAppts || [];
      for (const appt of apptList) {
        const apptTypeConfig = (scheduling.types && scheduling.types[appt.appointment_type_id]) || {};
        const existingDuration = apptTypeConfig.slot_duration || 60;
        if (slotsOverlap(data.time, config.slot_duration, appt.appointment_time, existingDuration, config.buffer_minutes)) {
          return { statusCode: 409, headers, body: JSON.stringify({ error: 'This time slot is no longer available' }) };
        }
      }

      // Update appointment
      const typeName = appointmentType.name;
      const customerName = existing.customers?.name || '';
      const newTitle = customerName ? `${typeName} - ${customerName}` : undefined;

      const updateFields = {
        appointment_date: data.date,
        appointment_time: data.time,
        updated_at: new Date().toISOString()
      };
      if (newTitle) updateFields.title = newTitle;

      const { error: updateErr } = await supabase
        .from('appointments')
        .update(updateFields)
        .eq('id', data.id);

      if (updateErr) throw updateErr;

      // Update GCal event if exists
      if (existing.gcal_event_id) {
        try {
          const { gcalRequest } = require('./gcal-utils');
          const apptDateTime = new Date(`${data.date}T${data.time}:00`);
          const endDateTime = new Date(apptDateTime.getTime() + config.slot_duration * 60 * 1000);

          await gcalRequest('PATCH', `/calendars/primary/events/${existing.gcal_event_id}`, {
            start: { dateTime: apptDateTime.toISOString() },
            end: { dateTime: endDateTime.toISOString() }
          });
          console.log('GCal event updated:', existing.gcal_event_id);
        } catch (gcalErr) {
          console.error('Failed to update GCal event:', gcalErr.message);
        }
      }

      // Reset reminder_sent_at since appointment was rescheduled
      await supabase
        .from('appointments')
        .update({ reminder_sent_at: null })
        .eq('id', data.id);

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          date: data.date,
          time: data.time
        })
      };
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid action. Use ?action=cancel or ?action=reschedule' }) };

  } catch (err) {
    console.error('Schedule manage error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Server error: ' + err.message })
    };
  }
};
