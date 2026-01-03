// =============================================
// CHANGE ORDER RESPONSE - Accept or decline a change order
// =============================================

const { getSupabase, success, error, handleCors } = require('./utils');

exports.handler = async (event) => {
  const corsResponse = handleCors(event);
  if (corsResponse) return corsResponse;
  
  if (event.httpMethod !== 'POST') {
    return error('Method not allowed', 405);
  }
  
  try {
    const { token, change_order_id, action } = JSON.parse(event.body);
    
    if (!token || !change_order_id || !action) {
      return error('Missing required fields', 400);
    }
    
    if (!['accept', 'decline'].includes(action)) {
      return error('Invalid action', 400);
    }
    
    const supabase = getSupabase();
    
    // Verify the quote access token
    const { data: quote } = await supabase
      .from('quotes')
      .select('id')
      .eq('access_token', token)
      .single();
    
    if (!quote) {
      return error('Invalid access token', 403);
    }
    
    // Verify the change order belongs to this quote
    const { data: changeOrder } = await supabase
      .from('change_orders')
      .select('*')
      .eq('id', change_order_id)
      .eq('quote_id', quote.id)
      .single();
    
    if (!changeOrder) {
      return error('Change order not found', 404);
    }
    
    // Check that it's in a state that can be responded to
    if (!['sent', 'viewed'].includes(changeOrder.status)) {
      return error('Change order cannot be modified', 400);
    }
    
    // Update the change order status
    const updateData = {
      status: action === 'accept' ? 'accepted' : 'declined',
      updated_at: new Date().toISOString()
    };
    
    if (action === 'accept') {
      updateData.accepted_at = new Date().toISOString();
    } else {
      updateData.declined_at = new Date().toISOString();
    }
    
    const { error: updateError } = await supabase
      .from('change_orders')
      .update(updateData)
      .eq('id', change_order_id);
    
    if (updateError) throw updateError;
    
    return success({
      message: action === 'accept' ? 'Change order accepted' : 'Change order declined',
      status: updateData.status
    });
    
  } catch (err) {
    console.error('Change order response error:', err);
    return error('Failed to process response', 500);
  }
};
