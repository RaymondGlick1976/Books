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
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #5B4C43; padding: 30px; text-align: center;">
          <h1 style="color: #C9A66B; margin: 0;">Homestead Cabinet Design</h1>
        </div>
        
        <div style="padding: 30px; background: #f9f9f9;">
          <h2 style="color: #333;">Hi ${customer.name},</h2>
          
          <p style="color: #555; font-size: 16px; line-height: 1.6;">
            Here is your invoice for recent services:
          </p>
          
          <div style="background: white; border: 1px solid #ddd; border-radius: 8px; padding: 20px; margin: 20px 0;">
            <h3 style="color: #5B4C43; margin-top: 0;">${invoice.title}</h3>
            <p style="color: #555; margin: 5px 0;"><strong>Invoice #:</strong> ${invoice.invoice_number}</p>
            <p style="color: #555; margin: 5px 0;"><strong>Total:</strong> ${formatCurrency(invoice.total)}</p>
            <p style="color: #555; margin: 5px 0;"><strong>Amount Due:</strong> <span style="color: #c0392b; font-size: 18px; font-weight: bold;">${formatCurrency(invoice.amount_due)}</span></p>
            ${invoice.due_date ? `<p style="color: #888; margin: 5px 0; font-size: 14px;">Due: ${new Date(invoice.due_date).toLocaleDateString()}</p>` : ''}
          </div>
          
          <p style="color: #555; font-size: 16px; line-height: 1.6;">
            To view the full invoice and make a payment, visit your customer portal:
          </p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${portalLink}" style="background: #C9A66B; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">View Invoice & Pay</a>
          </div>
          
          <p style="color: #888; font-size: 14px;">
            You'll be asked to enter your email address to access your portal.
          </p>
        </div>
        
        <div style="padding: 20px; text-align: center; background: #333; color: #888; font-size: 12px;">
          <p style="margin: 0;">Homestead Cabinet Design</p>
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
        from: 'Homestead Cabinet Design <onboarding@resend.dev>',
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
