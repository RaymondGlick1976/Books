const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
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
        statusCode: 400, 
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

    // Send email via your email provider
    // This example uses a generic fetch - replace with your provider (SendGrid, Resend, etc.)
    
    // For now, we'll use Resend if available, otherwise log
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
          text: body
        })
      });

      if (!response.ok) {
        const errorData = await response.text();
        console.error('Email send failed:', errorData);
        return {
          statusCode: 500,
          body: JSON.stringify({ error: 'Failed to send email', details: errorData })
        };
      }
    } else if (process.env.SENDGRID_API_KEY) {
      // SendGrid alternative
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
          content: [{ type: 'text/plain', value: body }]
        })
      });

      if (!response.ok) {
        const errorData = await response.text();
        console.error('Email send failed:', errorData);
        return {
          statusCode: 500,
          body: JSON.stringify({ error: 'Failed to send email', details: errorData })
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

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, message: 'Email sent successfully' })
    };

  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
