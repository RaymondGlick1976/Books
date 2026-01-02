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
    const { quoteId } = JSON.parse(event.body);

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
      await supabase
        .from('quotes')
        .update({ access_token: accessToken })
        .eq('id', quoteId);
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
          <h2 style="color: #333;">Hi ${customer.name.split(' ')[0]},</h2>
          
          <p style="color: #555; font-size: 16px; line-height: 1.6;">
            Thank you for your interest in our services! We've prepared a quote for your project:
          </p>
          
          <div style="background: white; border: 1px solid #ddd; border-radius: 8px; padding: 20px; margin: 20px 0;">
            <h3 style="color: #5B4C43; margin-top: 0;">${quote.title}</h3>
            <p style="color: #555; margin: 5px 0;"><strong>Quote #:</strong> ${quote.quote_number}</p>
            <p style="color: #555; margin: 5px 0;"><strong>Total:</strong> <span style="color: #5B4C43; font-size: 18px; font-weight: bold;">${totalDisplay}</span></p>
            ${quote.expires_at ? `<p style="color: #888; margin: 5px 0; font-size: 14px;">Valid until: ${new Date(quote.expires_at).toLocaleDateString()}</p>` : ''}
          </div>
          
          <p style="color: #555; font-size: 16px; line-height: 1.6;">
            Click the button below to view the full details and accept your quote:
          </p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${directLink}" style="background: #C9A66B; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">View Quote</a>
          </div>
          
          <p style="color: #888; font-size: 14px;">
            This link is unique to your quote and doesn't require a login.
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
        subject: `Quote #${quote.quote_number}: ${quote.title}`,
        html: emailHtml
      })
    });

    const result = await response.json();

    if (!response.ok) {
      console.error('Resend error:', result);
      return { statusCode: 500, body: JSON.stringify({ error: 'Failed to send email', details: result }) };
    }

    // Update quote sent_at timestamp
    await supabase
      .from('quotes')
      .update({ sent_at: new Date().toISOString(), status: 'sent' })
      .eq('id', quoteId);

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, emailId: result.id })
    };

  } catch (err) {
    console.error('Error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
