// =============================================
// PORTAL LOGIN - Send Magic Link
// =============================================

const { Resend } = require('resend');
const { getSupabase, success, error, handleCors, parseBody, generateToken } = require('./utils');

exports.handler = async (event) => {
  // Handle CORS
  const corsResponse = handleCors(event);
  if (corsResponse) return corsResponse;
  
  if (event.httpMethod !== 'POST') {
    return error('Method not allowed', 405);
  }
  
  const { email } = parseBody(event);
  
  if (!email) {
    return error('Email is required');
  }
  
  const supabase = getSupabase();
  
  try {
    // Check if customer exists
    const { data: customer, error: customerError } = await supabase
      .from('customers')
      .select('id, name, email')
      .eq('email', email.toLowerCase().trim())
      .single();
    
    if (customerError || !customer) {
      // Don't reveal if email exists or not for security
      // But still return success to prevent email enumeration
      return success({ message: 'If an account exists, a login link has been sent.' });
    }
    
    // Generate magic link token
    const token = generateToken();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    
    // Store token
    const { error: tokenError } = await supabase
      .from('auth_tokens')
      .insert({
        customer_id: customer.id,
        token,
        token_type: 'magic_link',
        expires_at: expiresAt.toISOString(),
        ip_address: event.headers['x-forwarded-for'] || event.headers['client-ip'],
        user_agent: event.headers['user-agent'],
      });
    
    if (tokenError) {
      console.error('Token creation error:', tokenError);
      return error('Failed to create login token', 500);
    }
    
    // Send email
    const siteUrl = (process.env.SITE_URL || 'https://homesteadcabinetdesign.com').replace(/\/+$/, '');
    const loginUrl = `${siteUrl}/portal/verify.html?token=${token}`;
    
    const resend = new Resend(process.env.RESEND_API_KEY);
    
    await resend.emails.send({
      from: 'Homestead Cabinet Design <noreply@homesteadcabinetdesign.com>',
      to: customer.email,
      subject: 'Your Login Link - Homestead Cabinet Design',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #2d2d2d; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: #1e3a5f; padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
            <h1 style="color: #ffffff; margin: 0; font-size: 24px;">Homestead Cabinet Design</h1>
          </div>
          <div style="background: #ffffff; padding: 30px; border: 1px solid #e0dcd5; border-top: none; border-radius: 0 0 8px 8px;">
            <p>Hi ${customer.name.split(' ')[0]},</p>
            <p>Click the button below to log in to your customer portal:</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${loginUrl}" style="display: inline-block; background: #c9a66b; color: #1e3a5f; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: 600;">Log In to Portal</a>
            </div>
            <p style="color: #5a5a5a; font-size: 14px;">This link will expire in 1 hour. If you didn't request this login link, you can safely ignore this email.</p>
            <hr style="border: none; border-top: 1px solid #e0dcd5; margin: 30px 0;">
            <p style="color: #8a8a8a; font-size: 12px; text-align: center;">
              Homestead Cabinet Design<br>
              Custom Cabinets • Refacing • Refinishing
            </p>
          </div>
        </body>
        </html>
      `,
    });
    
    return success({ message: 'Login link sent successfully' });
    
  } catch (err) {
    console.error('Login error:', err);
    return error('An error occurred. Please try again.', 500);
  }
};
