// =============================================
// PORTAL UPLOAD - Upload a file
// =============================================

const { getSupabase, success, error, handleCors, parseBody, validateSession, generateToken } = require('./utils');
const { Resend } = require('resend');

exports.handler = async (event) => {
  const corsResponse = handleCors(event);
  if (corsResponse) return corsResponse;
  
  if (event.httpMethod !== 'POST') {
    return error('Method not allowed', 405);
  }
  
  const customer = await validateSession(event);
  if (!customer) {
    return error('Unauthorized', 401);
  }
  
  const { file_name, file_type, file_data, quote_id, caption } = parseBody(event);
  
  if (!file_name || !file_data) {
    return error('File name and data required');
  }
  
  const supabase = getSupabase();
  
  try {
    // Decode base64
    const buffer = Buffer.from(file_data, 'base64');
    
    // Generate unique filename
    const ext = file_name.split('.').pop();
    const uniqueName = `${generateToken()}.${ext}`;
    const filePath = `customer-uploads/${customer.id}/${uniqueName}`;
    
    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from('customer-uploads')
      .upload(filePath, buffer, {
        contentType: file_type,
        upsert: false,
      });
    
    if (uploadError) {
      console.error('Upload error:', uploadError);
      return error('Failed to upload file', 500);
    }
    
    // Get public URL
    const { data: urlData } = supabase.storage
      .from('customer-uploads')
      .getPublicUrl(filePath);
    
    // Create database record
    const { data: upload, error: dbError } = await supabase
      .from('customer_uploads')
      .insert({
        customer_id: customer.id,
        quote_id: quote_id || null,
        file_url: urlData.publicUrl,
        file_name,
        file_type,
        file_size: buffer.length,
        caption: caption || null,
      })
      .select()
      .single();
    
    if (dbError) {
      console.error('DB error:', dbError);
      return error('Failed to save upload record', 500);
    }
    
    // Queue notification to admin
    await supabase
      .from('notification_queue')
      .insert({
        customer_id: customer.id,
        notification_type: 'customer_upload',
        reference_type: 'customer_upload',
        reference_id: upload.id,
        is_admin_notification: true,
      });
    
    // Send immediate email to admin
    if (process.env.ADMIN_EMAIL && process.env.RESEND_API_KEY) {
      try {
        const resend = new Resend(process.env.RESEND_API_KEY);
        await resend.emails.send({
          from: 'Homestead Cabinet Design <noreply@homesteadcabinetdesign.com>',
          to: process.env.ADMIN_EMAIL,
          subject: `New Photo Upload from ${customer.name}`,
          html: `
            <p>${customer.name} has uploaded a new photo to the customer portal.</p>
            <p><strong>File:</strong> ${file_name}</p>
            ${caption ? `<p><strong>Caption:</strong> ${caption}</p>` : ''}
            <p><a href="${urlData.publicUrl}">View Photo</a></p>
          `,
        });
      } catch (emailErr) {
        console.error('Email notification error:', emailErr);
      }
    }
    
    return success({ upload });
    
  } catch (err) {
    console.error('Upload error:', err);
    return error('Failed to upload file', 500);
  }
};
