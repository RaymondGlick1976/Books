const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Generate HMAC-signed token for secure redirect to schedule page
function generateBookingToken(dealId, formId) {
  const secret = process.env.BOOKING_TOKEN_SECRET;
  if (!secret) return null;
  const payload = { deal_id: dealId, form_id: formId, exp: Date.now() + 3600000 }; // 1 hour
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url');
  return `${payloadB64}.${sig}`;
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
    const data = JSON.parse(event.body);
    
    // Validate required fields
    if (!data.first_name || !data.last_name || !data.email) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Missing required fields' })
      };
    }
    
    // Get form config
    const { data: form } = await supabase
      .from('booking_forms')
      .select('*')
      .eq('id', data.form_id)
      .single();
    
    const defaultStage = form?.default_stage || 'new-lead';
    
    // Check if customer exists
    let customerId;
    const { data: existingCustomer } = await supabase
      .from('customers')
      .select('id')
      .eq('email', data.email.toLowerCase())
      .single();
    
    if (existingCustomer) {
      customerId = existingCustomer.id;
    } else {
      // Create new customer
      const { data: newCustomer, error: custError } = await supabase
        .from('customers')
        .insert([{
          name: `${data.first_name} ${data.last_name}`,
          email: data.email.toLowerCase(),
          phone: data.phone || null,
          address: data.address || null,
          city: data.city || null,
          state: data.state || null,
          zip: data.zip || null
        }])
        .select()
        .single();
      
      if (custError) throw custError;
      customerId = newCustomer.id;
    }
    
    // Upload attachments to Supabase Storage
    const attachmentUrls = [];
    if (data.attachments && data.attachments.length > 0) {
      for (let i = 0; i < data.attachments.length; i++) {
        const base64 = data.attachments[i];
        
        // Extract base64 data
        const matches = base64.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        if (!matches) continue;
        
        const contentType = matches[1];
        const buffer = Buffer.from(matches[2], 'base64');
        const ext = contentType.split('/')[1] || 'jpg';
        const filename = `booking/${Date.now()}_${i}.${ext}`;
        
        const { error: uploadError } = await supabase.storage
          .from('uploads')
          .upload(filename, buffer, { contentType });
        
        if (!uploadError) {
          const { data: urlData } = supabase.storage.from('uploads').getPublicUrl(filename);
          attachmentUrls.push(urlData.publicUrl);
        }
      }
    }
    
    // Generate job number
    const { data: jobNumber } = await supabase.rpc('generate_job_number');
    
    // Create deal
    const dealName = `${data.first_name} ${data.last_name} - ${form?.name || 'Web Request'}`;
    const { data: deal, error: dealError } = await supabase
      .from('jobs')
      .insert([{
        job_number: jobNumber,
        name: dealName,
        customer_id: customerId,
        stage: defaultStage,
        notes: data.service_details || '',
      }])
      .select()
      .single();
    
    if (dealError) throw dealError;
    
    // Create submission record
    const { error: subError } = await supabase
      .from('booking_submissions')
      .insert([{
        form_id: data.form_id,
        customer_id: customerId,
        deal_id: deal.id,
        first_name: data.first_name,
        last_name: data.last_name,
        email: data.email,
        phone: data.phone || null,
        address: data.address || null,
        city: data.city || null,
        state: data.state || null,
        zip: data.zip || null,
        service_details: data.service_details || null,
        how_heard: data.how_heard || null,
        preferred_date: data.preferred_date || null,
        preferred_time: data.preferred_time || null,
        sms_consent: data.sms_consent || false,
        custom_answers: data.custom_answers || {},
        attachments: attachmentUrls
      }]);
    
    if (subError) throw subError;
    
    // Update submission count
    await supabase
      .from('booking_forms')
      .update({ submission_count: (form?.submission_count || 0) + 1 })
      .eq('id', data.form_id);
    
    // Send notification email to admin
    try {
      // Get company settings for notification email
      const { data: companySettings } = await supabase
        .from('settings')
        .select('value')
        .eq('key', 'company')
        .single();
      
      // Get notification preferences
      const { data: notifSettings } = await supabase
        .from('settings')
        .select('value')
        .eq('key', 'notifications')
        .single();
      
      const notifications = notifSettings?.value || {};
      const company = companySettings?.value || {};
      
      // Check if new_booking notification is enabled (defaults to true)
      if (notifications.new_booking === false) {
        console.log('New booking notifications disabled');
      } else {
        const notificationEmail = company.notification_email || company.email || process.env.ADMIN_EMAIL;
        
        if (notificationEmail) {
          const fromEmail = company.from_email || company.email || process.env.FROM_EMAIL || 'noreply@homesteadcabinetdesign.com';
          const companyName = company.name || 'Homestead Cabinet Design';
        
        // Build email body
        const emailSubject = `🔔 New Lead: ${data.first_name} ${data.last_name} - ${form?.name || 'Booking Form'}`;
        
        let emailBody = `New booking form submission received!\n\n`;
        emailBody += `=== Contact Information ===\n`;
        emailBody += `Name: ${data.first_name} ${data.last_name}\n`;
        emailBody += `Email: ${data.email}\n`;
        emailBody += `Phone: ${data.phone || 'Not provided'}\n`;
        
        if (data.address) {
          emailBody += `\n=== Address ===\n`;
          emailBody += `${data.address}\n`;
          if (data.city || data.state || data.zip) {
            emailBody += `${data.city || ''}, ${data.state || ''} ${data.zip || ''}\n`;
          }
        }
        
        if (data.service_details) {
          emailBody += `\n=== Service Details ===\n`;
          emailBody += `${data.service_details}\n`;
        }
        
        if (data.how_heard) {
          emailBody += `\n=== How They Heard About Us ===\n`;
          emailBody += `${data.how_heard}\n`;
        }
        
        if (data.preferred_date || data.preferred_time) {
          emailBody += `\n=== Preferred Appointment ===\n`;
          if (data.preferred_date) emailBody += `Date: ${data.preferred_date}\n`;
          if (data.preferred_time) emailBody += `Time: ${data.preferred_time}\n`;
        }
        
        if (attachmentUrls.length > 0) {
          emailBody += `\n=== Attachments ===\n`;
          emailBody += `${attachmentUrls.length} photo(s) uploaded\n`;
          attachmentUrls.forEach((url, i) => {
            emailBody += `Photo ${i + 1}: ${url}\n`;
          });
        }
        
        emailBody += `\n=== Form Details ===\n`;
        emailBody += `Form: ${form?.name || 'Unknown'}\n`;
        emailBody += `Job Number: ${jobNumber}\n`;
        emailBody += `Submitted: ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })}\n`;
        emailBody += `\n---\nView this lead in your admin dashboard.`;
        
        // Send via Resend or SendGrid
        let emailStatus = 'sent';
        let emailError = null;

        if (process.env.RESEND_API_KEY) {
          const emailRes = await fetch('https://api.resend.com/emails', {
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
          if (!emailRes.ok) {
            emailError = await emailRes.text();
            emailStatus = 'failed';
            console.error('Failed to send notification email:', emailError);
          } else {
            console.log('Notification email sent to:', notificationEmail);
          }
        } else if (process.env.SENDGRID_API_KEY) {
          const sgRes = await fetch('https://api.sendgrid.com/v3/mail/send', {
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
          if (sgRes.ok || sgRes.status === 202) {
            console.log('Notification email sent to:', notificationEmail);
          } else {
            emailError = await sgRes.text();
            emailStatus = 'failed';
            console.error('SendGrid failed to send notification email:', emailError);
          }
        } else {
          console.log('No email provider configured. Would send notification to:', notificationEmail);
          console.log('Subject:', emailSubject);
        }

        // Log to email_logs
        try {
          await supabase.from('email_logs').insert({
            customer_id: customerId,
            deal_id: deal.id,
            to_email: notificationEmail,
            subject: emailSubject,
            body: emailBody,
            status: emailStatus,
            error_message: emailError,
            email_type: 'lead_notification'
          });
        } catch (logErr) {
          console.error('Failed to log email:', logErr);
        }
        } else {
          console.log('No notification email configured');
        }
      }
    } catch (emailErr) {
      // Don't fail the submission if email fails
      console.error('Failed to send notification email:', emailErr);
    }
    
    const token = generateBookingToken(deal.id, data.form_id);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        customer_id: customerId,
        deal_id: deal.id,
        token: token
      })
    };
    
  } catch (err) {
    console.error('Submission error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Failed to submit form: ' + err.message })
    };
  }
};
