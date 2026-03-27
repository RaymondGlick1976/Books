const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async (event) => {
  const headers = { 'Content-Type': 'application/json' };

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const { 
      to_email, 
      subject, 
      body, 
      template_id,
      customer_id,
      deal_id,
      appointment_id,
      sent_by 
    } = JSON.parse(event.body);

    if (!to_email || !subject || !body) {
      return {
        statusCode: 400, headers,
        body: JSON.stringify({ error: 'Missing required fields: to_email, subject, body' })
      };
    }

    // Get company settings for from email
    const { data: settings } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'company')
      .single();

    const company = settings?.value || {};
    const fromEmail = company.email || process.env.FROM_EMAIL || 'noreply@example.com';
    const companyName = company.name || 'Homestead Cabinet Design';

    // Convert plain text body to HTML with clickable links
    const htmlBody = body
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" style="color: #6366f1;">$1</a>')
      .replace(/(https?:\/\/[^\s<]+)(?![^<]*<\/a>)/g, '<a href="$1" style="color: #6366f1;">$1</a>')
      .replace(/\n/g, '<br>');
    const emailHtml = `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 15px; line-height: 1.6; color: #333;">${htmlBody}</div>`;

    // Send email via Resend or SendGrid
    if (process.env.RESEND_API_KEY) {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: `${companyName} <${fromEmail}>`,
          to: [to_email],
          subject: subject,
          html: emailHtml
        })
      });

      if (!response.ok) {
        const errorData = await response.text();
        console.error('Resend email send failed:', errorData);
        return {
          statusCode: 500, headers,
          body: JSON.stringify({ error: 'Failed to send email: ' + errorData })
        };
      }
    } else if (process.env.SENDGRID_API_KEY) {
      const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.SENDGRID_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: to_email }] }],
          from: { email: fromEmail, name: companyName },
          subject: subject,
          content: [{ type: 'text/html', value: emailHtml }]
        })
      });

      if (!response.ok) {
        const errorData = await response.text();
        console.error('SendGrid email send failed:', errorData);
        return {
          statusCode: 500, headers,
          body: JSON.stringify({ error: 'Failed to send email: ' + errorData })
        };
      }
    } else {
      // No email provider configured - just log
      console.log('EMAIL WOULD BE SENT:');
      console.log('To:', to_email);
      console.log('Subject:', subject);
      console.log('Body:', body);
      console.log('---');
      console.log('Note: Configure RESEND_API_KEY or SENDGRID_API_KEY to actually send emails');
    }

    // Log the sent email
    try {
      await supabase.from('email_logs').insert({
        template_id: template_id || null,
        customer_id: customer_id || null,
        deal_id: deal_id || null,
        appointment_id: appointment_id || null,
        to_email,
        subject,
        body,
        sent_by: sent_by || null
      });
    } catch (logErr) {
      console.error('Failed to log email:', logErr);
    }

    return {
      statusCode: 200, headers,
      body: JSON.stringify({ success: true, message: 'Email sent successfully' })
    };

  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500, headers,
      body: JSON.stringify({ error: error.message })
    };
  }
};
