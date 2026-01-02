// =============================================
// PORTAL FILES - Get all attachments for customer
// =============================================

const { getSupabase, success, error, handleCors, validateSession } = require('./utils');

exports.handler = async (event) => {
  const corsResponse = handleCors(event);
  if (corsResponse) return corsResponse;
  
  const customer = await validateSession(event);
  if (!customer) {
    return error('Unauthorized', 401);
  }
  
  const supabase = getSupabase();
  
  try {
    // Get all quote attachments for this customer's quotes
    const { data: attachments } = await supabase
      .from('quote_attachments')
      .select(`
        *,
        quote:quotes!inner(
          id,
          quote_number,
          title,
          customer_id
        )
      `)
      .eq('quote.customer_id', customer.id)
      .order('uploaded_at', { ascending: false });
    
    // Format response
    const formattedAttachments = (attachments || []).map(att => ({
      id: att.id,
      file_url: att.file_url,
      file_name: att.file_name,
      file_type: att.file_type,
      uploaded_at: att.uploaded_at,
      quote_id: att.quote?.id,
      quote_number: att.quote?.quote_number,
      quote_title: att.quote?.title,
    }));
    
    return success({ attachments: formattedAttachments });
    
  } catch (err) {
    console.error('Files fetch error:', err);
    return error('Failed to load files', 500);
  }
};
