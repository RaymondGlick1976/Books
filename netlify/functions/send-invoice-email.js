const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  try {
    const { invoiceId } = JSON.parse(event.body);

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

    // Generate portal link (remove trailing slash from SITE_URL if present)
    const siteUrl = (process.env.SITE_URL || 'https://hcdbooks.netlify.app').replace(/\/+$/, '');
    const portalLink = `${siteUrl}/portal/login.html`;

    // Format currency
    const formatCurrency = (amount) => {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount || 0);
    };

    // Send email via Resend
    const resendApiKey = process.env.RESEND_API_KEY;
    if (!resendApiKey) {
      return { statusCode: 500, body: JSON.stringify({ error: 'Email service not configured' }) };
    }

    const emailHtml = `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #6366f1; padding: 30px; text-align: center;">
          <h1 style="color: white; margin: 0; font-weight: 600;">Homestead Cabinet Design</h1>
          <p style="color: rgba(255,255,255,0.8); margin: 5px 0 0; font-size: 14px;">Love your kitchen again</p>
        </div>
        
        <div style="padding: 30px; background: #f8fafc;">
          <h2 style="color: #1e293b;">Hi ${customer.name.split(' ')[0]},</h2>
          
          <p style="color: #475569; font-size: 16px; line-height: 1.6;">
            Here is your invoice for recent services:
          </p>
          
          <div style="background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 20px 0;">
            <h3 style="color: #6366f1; margin-top: 0;">${invoice.title}</h3>
            <p style="color: #475569; margin: 5px 0;"><strong>Invoice #:</strong> ${invoice.invoice_number}</p>
            <p style="color: #475569; margin: 5px 0;"><strong>Total:</strong> ${formatCurrency(invoice.total)}</p>
            <p style="color: #475569; margin: 5px 0;"><strong>Amount Due:</strong> <span style="color: #ef4444; font-size: 18px; font-weight: bold;">${formatCurrency(invoice.amount_due)}</span></p>
            ${invoice.due_date ? `<p style="color: #94a3b8; margin: 5px 0; font-size: 14px;">Due: ${new Date(invoice.due_date).toLocaleDateString()}</p>` : ''}
          </div>
          
          <p style="color: #475569; font-size: 16px; line-height: 1.6;">
            To view the full invoice and make a payment, visit your customer portal:
          </p>
          
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
            You'll be asked to enter your email address to access your portal.
          </p>
        </div>
        
        <div style="padding: 20px; text-align: center; background: #1e293b; color: #94a3b8; font-size: 12px;">
          <p style="margin: 0;">Homestead Cabinet Design</p>
          <p style="margin: 5px 0;">Western MA & Northern CT</p>
          <p style="margin: 5px 0;">raymond@homesteadcabinetdesign.com</p>
        </div>
      </div>
    `;

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'Homestead Cabinet Design <raymond@homesteadcabinetdesign.com>',
        to: customer.email,
        subject: `Invoice #${invoice.invoice_number}: ${invoice.title}`,
        html: emailHtml
      })
    });

    const result = await response.json();

    if (!response.ok) {
      console.error('Resend error:', result);
      return { statusCode: 500, body: JSON.stringify({ error: 'Failed to send email', details: result }) };
    }

    // Update invoice sent_at timestamp
    await supabase
      .from('invoices')
      .update({ sent_at: new Date().toISOString(), status: 'sent' })
      .eq('id', invoiceId);

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, emailId: result.id })
    };

  } catch (err) {
    console.error('Error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
