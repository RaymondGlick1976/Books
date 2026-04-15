const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  try {
    const { invoiceId, customMessage, customSubject, cc, bcc } = JSON.parse(event.body);

    if (!invoiceId) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Invoice ID required' }) };
    }

    // Get invoice with customer info
    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices')
      .select('*, customers(*)')
      .eq('id', invoiceId)
      .single();

    if (invoiceError || !invoice) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Invoice not found' }) };
    }

    const customer = invoice.customers;
    if (!customer || !customer.email) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Customer email not found' }) };
    }

    // Generate access token if not exists
    let accessToken = invoice.access_token;
    if (!accessToken) {
      accessToken = crypto.randomBytes(32).toString('hex');
      console.log('Generated new access token for invoice:', invoiceId);

      const { error: updateError } = await supabase
        .from('invoices')
        .update({ access_token: accessToken })
        .eq('id', invoiceId);

      if (updateError) {
        console.error('Failed to save access token:', updateError);
        return {
          statusCode: 500,
          body: JSON.stringify({
            error: 'Failed to generate access token. Make sure the access_token column exists in the invoices table.',
            details: updateError.message
          })
        };
      }

      console.log('Saved access token successfully');
    } else {
      console.log('Using existing access token for invoice:', invoiceId);
    }

    // Generate direct invoice link
    const siteUrl = (process.env.SITE_URL || 'https://hcdbooks.netlify.app').replace(/\/+$/, '');
    const portalLink = `${siteUrl}/portal/invoice.html?token=${accessToken}`;

    // Format currency
    const formatCurrency = (amount) => {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount || 0);
    };

    // Get company settings
    const { data: settingsData } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'company')
      .single();

    const company = settingsData?.value || {};
    const companyName = company.name || 'Homestead Cabinet Design';
    const companyEmail = company.from_email || company.email || 'noreply@homesteadcabinetdesign.com';
    const companyTagline = company.tagline || 'Love your kitchen again';
    const companyAddress = company.service_area || 'Western MA & Northern CT';

    // Fetch invoice email template from database
    const { data: template } = await supabase
      .from('email_templates')
      .select('*')
      .eq('template_type', 'invoice')
      .eq('is_active', true)
      .limit(1)
      .single();

    // Default fallbacks if no template exists
    const defaultSubject = `Invoice #{{invoice_number}}: {{invoice_title}}`;
    const defaultBody = `Hi {{first_name}},\n\nHere is your invoice for recent services.`;

    const templateSubject = template?.subject || defaultSubject;
    const templateBody = template?.body || defaultBody;

    // Replace variables in template
    const firstName = customer.name?.split(' ')[0] || 'Customer';

    const replaceVars = (text) => {
      return text
        .replace(/\{\{first_name\}\}/g, firstName)
        .replace(/\{\{customer_name\}\}/g, customer.name || '')
        .replace(/\{\{company_name\}\}/g, companyName)
        .replace(/\{\{invoice_number\}\}/g, invoice.invoice_number || '')
        .replace(/\{\{invoice_title\}\}/g, invoice.title || '')
        .replace(/\{\{total\}\}/g, formatCurrency(invoice.total))
        .replace(/\{\{amount_due\}\}/g, formatCurrency(invoice.amount_due))
        .replace(/\{\{due_date\}\}/g, invoice.due_date ? new Date(invoice.due_date).toLocaleDateString() : '');
    };

    const resolvedSubject = replaceVars(templateSubject);
    const resolvedBody = replaceVars(templateBody);

    // Send email via Resend
    const resendApiKey = process.env.RESEND_API_KEY;
    if (!resendApiKey) {
      return { statusCode: 500, body: JSON.stringify({ error: 'Email service not configured' }) };
    }

    // Build email body HTML
    // If custom message is provided, use it AS the body (replaces template body)
    // If no custom message, use the template body
    const emailBodyText = customMessage || resolvedBody;

    const bodyHtml = emailBodyText
      .split('\n\n')
      .map(para => para.trim())
      .filter(Boolean)
      .map(para => `<p style="color: #475569; font-size: 16px; line-height: 1.6; margin: 0 0 15px 0; white-space: pre-wrap;">${para}</p>`)
      .join('\n          ');

    const emailHtml = `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #6366f1; padding: 30px; text-align: center;">
          <h1 style="color: white; margin: 0; font-weight: 600;">${companyName}</h1>
          <p style="color: rgba(255,255,255,0.8); margin: 5px 0 0; font-size: 14px;">${companyTagline}</p>
        </div>

        <div style="padding: 30px; background: #f8fafc;">
          ${bodyHtml}

          <div style="background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 20px 0;">
            <h3 style="color: #6366f1; margin-top: 0;">${invoice.title}</h3>
            <p style="color: #475569; margin: 5px 0;"><strong>Invoice #:</strong> ${invoice.invoice_number}</p>
            <p style="color: #475569; margin: 5px 0;"><strong>Total:</strong> ${formatCurrency(invoice.total)}</p>
            <p style="color: #475569; margin: 5px 0;"><strong>Amount Due:</strong> <span style="color: #ef4444; font-size: 18px; font-weight: bold;">${formatCurrency(invoice.amount_due)}</span></p>
            ${invoice.due_date ? `<p style="color: #94a3b8; margin: 5px 0; font-size: 14px;">Due: ${new Date(invoice.due_date).toLocaleDateString()}</p>` : ''}
          </div>

          <div style="text-align: center; margin: 30px 0;">
            <a href="${portalLink}" style="background: #6366f1; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block;">View Invoice & Pay</a>
          </div>

          <div style="background: #e0e7ff; border-radius: 8px; padding: 15px; margin: 20px 0;">
            <p style="color: #4338ca; font-size: 14px; margin: 0 0 10px 0; font-weight: 600;">
              📋 If the button doesn't work, copy and paste this link into your browser:
            </p>
            <p style="color: #1e293b; font-size: 13px; margin: 0; word-break: break-all; background: white; padding: 10px; border-radius: 4px; font-family: monospace;">
              ${portalLink}
            </p>
          </div>

          <p style="color: #94a3b8; font-size: 14px;">
            This link will take you directly to your invoice where you can view details and make a payment.
          </p>

          <div style="border-top: 1px solid #e2e8f0; margin-top: 20px; padding-top: 20px;">
            <p style="color: #64748b; font-size: 14px; margin: 0;">
              Want to view all your quotes, invoices, and upload files?
              <a href="${siteUrl}/portal/login.html" style="color: #6366f1; text-decoration: underline;">Access your Customer Portal</a>
            </p>
          </div>
        </div>

        <div style="padding: 20px; text-align: center; background: #1e293b; color: #94a3b8; font-size: 12px;">
          <p style="margin: 0;">${companyName}</p>
          <p style="margin: 5px 0;">${companyAddress}</p>
          <p style="margin: 5px 0;">${companyEmail}</p>
        </div>
      </div>
    `;

    // Use custom subject if provided, then template subject, then default
    const emailSubject = customSubject || resolvedSubject;

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: `${companyName} <${companyEmail}>`,
        to: customer.email,
        ...(cc ? { cc: cc.split(',').map(e => e.trim()).filter(Boolean) } : {}),
        ...(bcc ? { bcc: bcc.split(',').map(e => e.trim()).filter(Boolean) } : {}),
        subject: emailSubject,
        html: emailHtml
      })
    });

    const result = await response.json();

    if (!response.ok) {
      console.error('Resend error:', result);
      return { statusCode: 500, body: JSON.stringify({ error: 'Failed to send email', details: result }) };
    }

    // Log the sent email
    try {
      await supabase.from('email_logs').insert({
        template_id: template?.id || null,
        customer_id: customer.id,
        to_email: customer.email,
        subject: emailSubject,
        body: resolvedBody + (customMessage ? '\n\n[Personal message]: ' + customMessage : '')
      });
    } catch (logErr) {
      console.error('Failed to log email:', logErr);
    }

    // Update invoice sent_at timestamp and status
    const { error: statusError } = await supabase
      .from('invoices')
      .update({ sent_at: new Date().toISOString(), status: 'sent' })
      .eq('id', invoiceId);

    if (statusError) {
      console.error('Failed to update invoice status:', statusError);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, emailId: result.id })
    };

  } catch (err) {
    console.error('Error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
