// =============================================
// SHARED UTILITIES FOR NETLIFY FUNCTIONS
// =============================================

const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase with service role for admin access
function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

// Standard response helpers
function success(data, statusCode = 200) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
    body: JSON.stringify(data),
  };
}

function error(message, statusCode = 400) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
    body: JSON.stringify({ error: message }),
  };
}

// CORS preflight handler
function handleCors(event) {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      },
      body: '',
    };
  }
  return null;
}

// Parse request body
function parseBody(event) {
  try {
    return event.body ? JSON.parse(event.body) : {};
  } catch {
    return {};
  }
}

// Get session from cookie
function getSessionToken(event) {
  const cookies = event.headers.cookie || '';
  const match = cookies.match(/portal_session=([^;]+)/);
  return match ? match[1] : null;
}

// Validate portal session and return customer
async function validateSession(event) {
  const token = getSessionToken(event);
  if (!token) {
    return null;
  }
  
  const supabase = getSupabase();
  
  const { data: authToken, error: tokenError } = await supabase
    .from('auth_tokens')
    .select('*, customer:customers(*)')
    .eq('token', token)
    .eq('token_type', 'session')
    .gt('expires_at', new Date().toISOString())
    .single();
  
  if (tokenError || !authToken) {
    return null;
  }
  
  return authToken.customer;
}

// Set session cookie
function setSessionCookie(token, maxAge = 30 * 24 * 60 * 60) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `portal_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

// Clear session cookie
function clearSessionCookie() {
  return 'portal_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0';
}

// Generate random token
function generateToken() {
  return require('crypto').randomUUID();
}

// Advance a deal's pipeline stage forward (never backward).
// Finds the job by quoteId first, falls back to customerId.
// Only updates if the target stage's sort_order > current stage's sort_order.
async function advanceDealStage(supabase, { quoteId, customerId, targetStageId }) {
  try {
    // Find the job
    let job = null;
    if (quoteId) {
      const { data } = await supabase
        .from('jobs')
        .select('id, stage')
        .eq('quote_id', quoteId)
        .limit(1)
        .single();
      job = data;
    }
    if (!job && customerId) {
      const { data } = await supabase
        .from('jobs')
        .select('id, stage')
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      job = data;
    }
    if (!job) {
      console.log('[advanceDealStage] No job found for quote:', quoteId, 'customer:', customerId);
      return;
    }

    // Already at the target stage
    if (job.stage === targetStageId) return;

    // Get sort_order for current and target stages
    const { data: stages } = await supabase
      .from('job_stages')
      .select('stage_id, sort_order')
      .in('stage_id', [job.stage, targetStageId]);

    if (!stages || stages.length < 2) {
      console.log('[advanceDealStage] Could not find both stages:', job.stage, targetStageId);
      return;
    }

    const currentOrder = stages.find(s => s.stage_id === job.stage)?.sort_order;
    const targetOrder = stages.find(s => s.stage_id === targetStageId)?.sort_order;

    if (currentOrder == null || targetOrder == null) return;

    // Only move forward
    if (currentOrder >= targetOrder) {
      console.log('[advanceDealStage] Skipping: current stage', job.stage, '(order', currentOrder, ') >= target', targetStageId, '(order', targetOrder, ')');
      return;
    }

    const { error: updateError } = await supabase
      .from('jobs')
      .update({ stage: targetStageId, updated_at: new Date().toISOString() })
      .eq('id', job.id);

    if (updateError) {
      console.error('[advanceDealStage] Failed to update job stage:', updateError);
    } else {
      console.log('[advanceDealStage] Advanced job', job.id, 'from', job.stage, 'to', targetStageId);
    }
  } catch (err) {
    console.error('[advanceDealStage] Error:', err);
  }
}

// Email the business owner when a customer accepts a quote (same style as the
// new-lead and new-appointment notifications). Never throws — acceptance must
// not fail because of an email problem. Skips if a notification was already
// sent for this quote (Stripe webhook + verify-checkout can both fire).
async function notifyQuoteAccepted(supabase, quoteId, { paymentMethod, amountPaid } = {}) {
  try {
    const [{ data: companySettings }, { data: notifSettings }] = await Promise.all([
      supabase.from('settings').select('value').eq('key', 'company').maybeSingle(),
      supabase.from('settings').select('value').eq('key', 'notifications').maybeSingle()
    ]);
    const company = companySettings?.value || {};
    const notifications = notifSettings?.value || {};
    if (notifications.quote_accepted === false) {
      console.log('[notifyQuoteAccepted] Quote accepted notifications disabled');
      return;
    }
    const notificationEmail = company.notification_email || company.email || process.env.ADMIN_EMAIL;
    if (!notificationEmail) {
      console.log('[notifyQuoteAccepted] No notification email configured');
      return;
    }

    const { data: quote } = await supabase
      .from('quotes')
      .select('id, quote_number, title, total, customer_id, selected_package_id, accepted_at')
      .eq('id', quoteId)
      .single();
    if (!quote) return;

    const quoteLabel = quote.quote_number ? `#${quote.quote_number}` : quote.id;

    // Don't send twice for the same quote
    const { data: already } = await supabase
      .from('email_logs')
      .select('id')
      .eq('email_type', 'quote_accepted_notification')
      .eq('status', 'sent')
      .ilike('subject', `%${quoteLabel}%`)
      .limit(1);
    if (already && already.length > 0) {
      console.log('[notifyQuoteAccepted] Already notified for quote', quoteLabel);
      return;
    }

    const [{ data: customer }, { data: optionalItems }, pkgRes] = await Promise.all([
      supabase.from('customers').select('name, email, phone, address, city, state, zip').eq('id', quote.customer_id).maybeSingle(),
      supabase.from('quote_line_items').select('description, line_total, is_selected')
        .eq('quote_id', quote.id).eq('is_optional', true).order('sort_order'),
      quote.selected_package_id
        ? supabase.from('quote_packages').select('name').eq('id', quote.selected_package_id).maybeSingle()
        : Promise.resolve({ data: null })
    ]);

    const money = (n) => `$${(parseFloat(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const customerName = customer?.name || 'Customer';
    const fromEmail = company.from_email || company.email || process.env.FROM_EMAIL || 'noreply@homesteadcabinetdesign.com';
    const companyName = company.name || 'Homestead Cabinet Design';
    const siteUrl = (process.env.SITE_URL || 'https://hcdbooks.netlify.app').replace(/\/+$/, '');

    const emailSubject = `✅ Quote Accepted: ${customerName} - ${quoteLabel}${quote.title ? ' ' + quote.title : ''}`;

    let emailBody = `Good news! A customer accepted a quote.\n\n`;
    emailBody += `=== Quote ===\n`;
    emailBody += `Quote: ${quoteLabel}${quote.title ? ' - ' + quote.title : ''}\n`;
    emailBody += `Total: ${money(quote.total)}\n`;
    if (pkgRes?.data?.name) emailBody += `Package Selected: ${pkgRes.data.name}\n`;
    if (paymentMethod === 'card') {
      emailBody += `Payment: Paid by card online${amountPaid ? ` (${money(amountPaid)} deposit received)` : ''}\n`;
    } else if (paymentMethod === 'check') {
      emailBody += `Payment: Will pay by check (deposit not yet received)\n`;
    }

    const opts = optionalItems || [];
    if (opts.length > 0) {
      const added = opts.filter(i => i.is_selected);
      const declined = opts.filter(i => !i.is_selected);
      emailBody += `\n=== Optional Items ===\n`;
      emailBody += added.length
        ? added.map(i => `Added: ${i.description} (${money(i.line_total)})`).join('\n') + '\n'
        : `None added\n`;
      if (declined.length) {
        emailBody += declined.map(i => `Not added: ${i.description}`).join('\n') + '\n';
      }
    }

    emailBody += `\n=== Customer ===\n`;
    emailBody += `Name: ${customerName}\n`;
    emailBody += `Email: ${customer?.email || 'Not provided'}\n`;
    emailBody += `Phone: ${customer?.phone || 'Not provided'}\n`;
    if (customer?.address) {
      emailBody += `Address: ${customer.address}${customer.city ? ', ' + customer.city : ''}${customer.state ? ', ' + customer.state : ''} ${customer.zip || ''}\n`;
    }

    emailBody += `\nAccepted: ${new Date(quote.accepted_at || Date.now()).toLocaleString('en-US', { timeZone: 'America/New_York' })}\n`;
    emailBody += `\n---\nView the quote: ${siteUrl}/admin/quote-detail.html?id=${quote.id}`;

    let emailStatus = 'sent';
    let emailError = null;

    if (process.env.RESEND_API_KEY) {
      const res = await fetch('https://api.resend.com/emails', {
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
      if (!res.ok) {
        emailError = await res.text();
        emailStatus = 'failed';
        console.error('[notifyQuoteAccepted] Resend error:', emailError);
      }
    } else if (process.env.SENDGRID_API_KEY) {
      const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
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
      if (!(res.ok || res.status === 202)) {
        emailError = await res.text();
        emailStatus = 'failed';
        console.error('[notifyQuoteAccepted] SendGrid error:', emailError);
      }
    } else {
      console.log('[notifyQuoteAccepted] No email provider configured. Would send to:', notificationEmail);
      emailStatus = 'failed';
      emailError = 'No email provider configured';
    }

    try {
      await supabase.from('email_logs').insert({
        customer_id: quote.customer_id,
        to_email: notificationEmail,
        subject: emailSubject,
        body: emailBody,
        status: emailStatus,
        error_message: emailError,
        email_type: 'quote_accepted_notification'
      });
    } catch (logErr) {
      console.error('[notifyQuoteAccepted] Failed to log email:', logErr);
    }
  } catch (err) {
    console.error('[notifyQuoteAccepted] Error:', err);
  }
}

module.exports = {
  notifyQuoteAccepted,
  getSupabase,
  success,
  error,
  handleCors,
  parseBody,
  getSessionToken,
  validateSession,
  setSessionCookie,
  clearSessionCookie,
  generateToken,
  advanceDealStage,
};
