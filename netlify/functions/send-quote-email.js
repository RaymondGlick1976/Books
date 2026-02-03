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
    const { quoteId, customMessage, customSubject, cc, bcc } = JSON.parse(event.body);

    if (!quoteId) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Quote ID required' }) };
    }

    // Get quote with customer info
    const { data: quote, error: quoteError } = await supabase
      .from('quotes')
      .select('*, customers(*)')
      .eq('id', quoteId)
      .single();

    if (quoteError || !quote) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Quote not found' }) };
    }

    const customer = quote.customers;
    if (!customer || !customer.email) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Customer email not found' }) };
    }

    // Generate access token if not exists
    let accessToken = quote.access_token;
    if (!accessToken) {
      accessToken = crypto.randomBytes(32).toString('hex');
      console.log('Generated new access token for quote:', quoteId);
      
      const { error: updateError } = await supabase
        .from('quotes')
        .update({ access_token: accessToken })
        .eq('id', quoteId);
      
      if (updateError) {
        console.error('Failed to save access token:', updateError);
        return { 
          statusCode: 500, 
          body: JSON.stringify({ 
            error: 'Failed to generate access token. Make sure the access_token column exists in the quotes table.',
            details: updateError.message 
          }) 
        };
      }
      
      console.log('Saved access token successfully');
    } else {
      console.log('Using existing access token for quote:', quoteId);
    }

    // Generate portal link with direct access token
    const siteUrl = (process.env.SITE_URL || 'https://hcdbooks.netlify.app').replace(/\/+$/, '');
    const directLink = `${siteUrl}/portal/quote.html?token=${accessToken}`;

    // Format total for email
    const formatCurrency = (amount) => {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount || 0);
    };

    let totalDisplay;
    if (quote.quote_type === 'ballpark' && quote.total_low !== quote.total_high) {
      totalDisplay = `${formatCurrency(quote.total_low)} - ${formatCurrency(quote.total_high)}`;
    } else {
      totalDisplay = formatCurrency(quote.total);
    }

    // Get company settings
    const { data: settingsData } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'company')
      .single();
    
    const company = settingsData?.value || {};
    const companyName = company.name || 'Homestead Cabinet Design';
    const companyEmail = company.email || 'raymond@homesteadcabinetdesign.com';
    const companyTagline = company.tagline || 'Love your kitchen again';
    const companyAddress = company.service_area || 'Western MA & Northern CT';

    // Fetch quote email template from database
    const { data: template } = await supabase
      .from('email_templates')
      .select('*')
      .eq('template_type', 'quote')
      .eq('is_active', true)
      .limit(1)
      .single();

    // Default fallbacks if no template exists
    const defaultSubject = `Quote #{{quote_number}}: {{quote_title}}`;
    const defaultBody = `Hi {{first_name}},\n\nThank you for requesting a quote!`;

    const templateSubject = template?.subject || defaultSubject;
    const templateBody = template?.body || defaultBody;

    // Replace variables in template
    const firstName = customer.name?.split(' ')[0] || 'Customer';
    
    const replaceVars = (text) => {
      return text
        .replace(/\{\{first_name\}\}/g, firstName)
        .replace(/\{\{customer_name\}\}/g, customer.name || '')
        .replace(/\{\{company_name\}\}/g, companyName)
        .replace(/\{\{quote_number\}\}/g, quote.quote_number || '')
        .replace(/\{\{quote_title\}\}/g, quote.title || '')
        .replace(/\{\{total\}\}/g, totalDisplay)
        .replace(/\{\{amount_due\}\}/g, totalDisplay)
        .replace(/\{\{due_date\}\}/g, quote.expires_at ? new Date(quote.expires_at).toLocaleDateString() : '');
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
            <h3 style="color: #6366f1; margin-top: 0;">${quote.title}</h3>
            <p style="color: #475569; margin: 5px 0;"><strong>Quote #:</strong> ${quote.quote_number}</p>
            <p style="color: #475569; margin: 5px 0;"><strong>Total:</strong> <span style="color: #6366f1; font-size: 18px; font-weight: bold;">${totalDisplay}</span></p>
            ${quote.expires_at ? `<p style="color: #94a3b8; margin: 5px 0; font-size: 14px;">Valid until: ${new Date(quote.expires_at).toLocaleDateString()}</p>` : ''}
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${directLink}" style="background: #6366f1; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block;">View Quote</a>
          </div>
          
          <div style="background: #e0e7ff; border-radius: 8px; padding: 15px; margin: 20px 0;">
            <p style="color: #4338ca; font-size: 14px; margin: 0 0 10px 0; font-weight: 600;">
              📋 If the button doesn't work, copy and paste this link into your browser:
            </p>
            <p style="color: #1e293b; font-size: 13px; margin: 0; word-break: break-all; background: white; padding: 10px; border-radius: 4px; font-family: monospace;">
              ${directLink}
            </p>
          </div>
          
          <p style="color: #94a3b8; font-size: 14px;">
            This link is unique to your quote and doesn't require a login.
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

    // Update quote status to sent
    const { error: updateError } = await supabase
      .from('quotes')
      .update({ sent_at: new Date().toISOString(), status: 'sent' })
      .eq('id', quoteId);
    
    if (updateError) {
      console.error('Failed to update quote status:', updateError);
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
