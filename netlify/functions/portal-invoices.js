// =============================================
// PORTAL INVOICES - Get all invoices and payments
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

  // Single-invoice detail mode: /api/portal-invoices?id=<invoice_id>
  const invoiceId = event.queryStringParameters?.id;
  if (invoiceId) {
    try {
      const { data: inv, error: invError } = await supabase
        .from('invoices')
        .select('*, customers(name, email, phone, address, city, state, zip)')
        .eq('id', invoiceId)
        .eq('customer_id', customer.id)
        .single();

      if (invError || !inv) return error('Invoice not found', 404);

      const { data: items } = await supabase
        .from('invoice_line_items')
        .select('*')
        .eq('invoice_id', invoiceId)
        .order('sort_order');

      const { data: pmts } = await supabase
        .from('payments')
        .select('*')
        .eq('invoice_id', invoiceId)
        .eq('status', 'succeeded')
        .order('payment_date', { ascending: false });

      const { data: companySetting } = await supabase
        .from('settings')
        .select('value')
        .eq('key', 'company')
        .single();

      return success({
        invoice: inv,
        line_items: items || [],
        payments: pmts || [],
        company: companySetting?.value || null,
      });
    } catch (err) {
      console.error('Invoice detail fetch error:', err);
      return error('Failed to load invoice', 500);
    }
  }

  try {
    // Get invoices (exclude draft and archived)
    const { data: invoices } = await supabase
      .from('invoices')
      .select('*')
      .eq('customer_id', customer.id)
      .not('status', 'in', '(draft,archived)')
      .order('created_at', { ascending: false });
    
    // Get payments with invoice info
    const { data: payments } = await supabase
      .from('payments')
      .select(`
        *,
        invoices(invoice_number, title)
      `)
      .eq('customer_id', customer.id)
      .eq('status', 'succeeded')
      .order('payment_date', { ascending: false });
    
    return success({
      invoices: invoices || [],
      payments: payments || [],
      customer: {
        name: customer.name,
        company: customer.company,
        email: customer.email,
        phone: customer.phone,
        address: customer.address,
        city: customer.city,
        state: customer.state,
        zip: customer.zip,
      },
    });
    
  } catch (err) {
    console.error('Invoices fetch error:', err);
    return error('Failed to load invoices', 500);
  }
};
