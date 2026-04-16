// =============================================
// PUBLIC INVOICE - Get invoice by access token (no login required)
// =============================================

const { getSupabase, success, error, handleCors } = require('./utils');

exports.handler = async (event) => {
  const corsResponse = handleCors(event);
  if (corsResponse) return corsResponse;

  const token = event.queryStringParameters?.token;
  const isPreview = event.queryStringParameters?.preview === '1';

  if (!token) {
    return error('Access token required', 400);
  }

  console.log('Looking up invoice with token:', token.substring(0, 8) + '...', isPreview ? '(admin preview)' : '');

  const supabase = getSupabase();

  try {
    // Get invoice by access token
    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices')
      .select('*, customers(name, company, email, phone, address, city, state, zip)')
      .eq('access_token', token)
      .single();

    if (invoiceError) {
      console.error('Invoice lookup error:', invoiceError);
      return error('Invoice not found or link expired', 404);
    }

    if (!invoice) {
      console.error('No invoice found for token');
      return error('Invoice not found or link expired', 404);
    }

    console.log('Found invoice:', invoice.invoice_number);

    // Get line items
    const { data: lineItems } = await supabase
      .from('invoice_line_items')
      .select('*')
      .eq('invoice_id', invoice.id)
      .order('sort_order');

    // Get payments for this invoice
    const { data: payments } = await supabase
      .from('payments')
      .select('*')
      .eq('invoice_id', invoice.id)
      .eq('status', 'succeeded')
      .order('payment_date', { ascending: false });

    // Get company settings for header
    let companySettings = null;
    try {
      const { data: companyData } = await supabase
        .from('settings')
        .select('value')
        .eq('key', 'company')
        .single();

      if (companyData && companyData.value) {
        companySettings = companyData.value;
      }
    } catch (e) {
      console.log('Company settings not found');
    }

    // Update to viewed if sent (skip for admin preview)
    if (invoice.status === 'sent' && !isPreview) {
      await supabase
        .from('invoices')
        .update({
          status: 'viewed',
          viewed_at: new Date().toISOString()
        })
        .eq('id', invoice.id);

      invoice.status = 'viewed';
      invoice.viewed_at = new Date().toISOString();
    }

    // Remove internal notes before sending
    delete invoice.internal_notes;

    return success({
      invoice,
      line_items: lineItems || [],
      payments: payments || [],
      company: companySettings,
    });

  } catch (err) {
    console.error('Public invoice fetch error:', err);
    return error('Failed to load invoice', 500);
  }
};
