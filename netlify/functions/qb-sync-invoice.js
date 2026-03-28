// =============================================
// QUICKBOOKS SYNC INVOICE - Create invoice in QB
// =============================================

const { qbRequest, supabase } = require('./qb-utils');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders(), body: '' };
  }
  
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders(), body: 'Method not allowed' };
  }
  
  try {
    const { invoiceId } = JSON.parse(event.body);
    
    if (!invoiceId) {
      return {
        statusCode: 400,
        headers: corsHeaders(),
        body: JSON.stringify({ error: 'Invoice ID required' })
      };
    }
    
    // Get invoice with customer
    const { data: invoice, error: invError } = await supabase
      .from('invoices')
      .select('*, customers(*)')
      .eq('id', invoiceId)
      .single();
    
    if (invError || !invoice) {
      return {
        statusCode: 404,
        headers: corsHeaders(),
        body: JSON.stringify({ error: 'Invoice not found' })
      };
    }
    
    // Check if invoice already synced — still sync any new payments
    if (invoice.qb_invoice_id) {
      const custId = invoice.customers?.qb_customer_id;
      let paymentsSynced = 0;

      if (custId) {
        const { data: payments } = await supabase
          .from('payments')
          .select('*')
          .eq('invoice_id', invoiceId)
          .eq('status', 'succeeded')
          .is('qb_payment_id', null)
          .order('payment_date');

        if (payments && payments.length > 0) {
          for (const payment of payments) {
            try {
              const qbPayment = {
                CustomerRef: { value: custId },
                TotalAmt: payment.amount,
                TxnDate: payment.payment_date ? payment.payment_date.split('T')[0] : new Date().toISOString().split('T')[0],
                Line: [{
                  Amount: payment.amount,
                  LinkedTxn: [{
                    TxnId: invoice.qb_invoice_id,
                    TxnType: 'Invoice'
                  }]
                }]
              };
              if (payment.reference_number) {
                qbPayment.PaymentRefNum = payment.reference_number;
              }
              const payResult = await qbRequest('POST', '/payment', qbPayment);
              await supabase
                .from('payments')
                .update({ qb_payment_id: payResult.Payment.Id })
                .eq('id', payment.id);
              paymentsSynced++;
            } catch (payErr) {
              console.error('Failed to sync payment:', payment.id, payErr.message);
            }
          }
        }
      }

      return {
        statusCode: 200,
        headers: corsHeaders(),
        body: JSON.stringify({
          success: true,
          qb_invoice_id: invoice.qb_invoice_id,
          payments_synced: paymentsSynced,
          message: paymentsSynced > 0
            ? `Invoice already synced. ${paymentsSynced} new payment(s) synced.`
            : 'Invoice already synced to QuickBooks'
        })
      };
    }
    
    const customer = invoice.customers;
    if (!customer) {
      return {
        statusCode: 400,
        headers: corsHeaders(),
        body: JSON.stringify({ error: 'Invoice has no associated customer' })
      };
    }
    
    // Ensure customer is synced to QB first
    let qbCustomerId = customer.qb_customer_id;
    if (!qbCustomerId) {
      // Sync customer first
      const custResult = await syncCustomer(customer);
      qbCustomerId = custResult.qb_customer_id;
      
      // Update customer in our DB
      await supabase
        .from('customers')
        .update({ qb_customer_id: qbCustomerId })
        .eq('id', customer.id);
    }
    
    // Get invoice line items
    const { data: lineItems } = await supabase
      .from('invoice_line_items')
      .select('*')
      .eq('invoice_id', invoiceId)
      .order('sort_order');
    
    // Find or create a generic "Services" item in QB for line items
    let servicesItemId;
    try {
      const query = `SELECT * FROM Item WHERE Name = 'Services' AND Type = 'Service'`;
      const searchResult = await qbRequest('GET', `/query?query=${encodeURIComponent(query)}`);
      if (searchResult.QueryResponse?.Item?.length > 0) {
        servicesItemId = searchResult.QueryResponse.Item[0].Id;
      }
    } catch (e) {
      console.log('Item search failed:', e.message);
    }

    if (!servicesItemId) {
      try {
        // Look up an income account to attach the item to
        let incomeAccountId;
        const acctQuery = `SELECT * FROM Account WHERE AccountType = 'Income' MAXRESULTS 1`;
        const acctResult = await qbRequest('GET', `/query?query=${encodeURIComponent(acctQuery)}`);
        if (acctResult.QueryResponse?.Account?.length > 0) {
          incomeAccountId = acctResult.QueryResponse.Account[0].Id;
        }

        const newItem = {
          Name: 'Services',
          Type: 'Service'
        };
        if (incomeAccountId) {
          newItem.IncomeAccountRef = { value: incomeAccountId };
        }
        const itemResult = await qbRequest('POST', '/item', newItem);
        servicesItemId = itemResult.Item.Id;
      } catch (e) {
        console.log('Failed to create Services item:', e.message);
      }
    }

    // Build QB invoice
    const qbInvoice = {
      CustomerRef: { value: qbCustomerId },
      DocNumber: invoice.invoice_number,
      TxnDate: invoice.created_at ? invoice.created_at.split('T')[0] : new Date().toISOString().split('T')[0],
      DueDate: invoice.due_date ? invoice.due_date.split('T')[0] : undefined,
      Line: []
    };

    // Add line items
    if (lineItems && lineItems.length > 0) {
      for (const item of lineItems) {
        const lineDetail = {
          Qty: item.quantity || 1,
          UnitPrice: item.unit_price || 0
        };
        if (servicesItemId) {
          lineDetail.ItemRef = { value: servicesItemId, name: 'Services' };
        }
        qbInvoice.Line.push({
          DetailType: 'SalesItemLineDetail',
          Amount: (item.quantity || 1) * (item.unit_price || 0),
          Description: item.description || '',
          SalesItemLineDetail: lineDetail
        });
      }
    } else {
      const lineDetail = {
        Qty: 1,
        UnitPrice: invoice.subtotal || invoice.total || 0
      };
      if (servicesItemId) {
        lineDetail.ItemRef = { value: servicesItemId, name: 'Services' };
      }
      qbInvoice.Line.push({
        DetailType: 'SalesItemLineDetail',
        Amount: invoice.subtotal || invoice.total || 0,
        Description: invoice.title || 'Services',
        SalesItemLineDetail: lineDetail
      });
    }

    // Add tax as a separate line item if present
    if (invoice.tax_amount && invoice.tax_amount > 0) {
      const taxDetail = {
        Qty: 1,
        UnitPrice: invoice.tax_amount
      };
      if (servicesItemId) {
        taxDetail.ItemRef = { value: servicesItemId, name: 'Services' };
      }
      qbInvoice.Line.push({
        DetailType: 'SalesItemLineDetail',
        Amount: invoice.tax_amount,
        Description: `Sales Tax (${((invoice.tax_rate || 0) * 100).toFixed(2)}%)`,
        SalesItemLineDetail: taxDetail
      });
    }

    // Create invoice in QuickBooks
    const result = await qbRequest('POST', '/invoice', qbInvoice);
    const qbInvoiceId = result.Invoice.Id;
    
    // Update our invoice with QB ID
    await supabase
      .from('invoices')
      .update({
        qb_invoice_id: qbInvoiceId,
        qb_synced_at: new Date().toISOString()
      })
      .eq('id', invoiceId);

    // Sync payments for this invoice
    let paymentsSynced = 0;
    const { data: payments } = await supabase
      .from('payments')
      .select('*')
      .eq('invoice_id', invoiceId)
      .eq('status', 'succeeded')
      .order('payment_date');

    if (payments && payments.length > 0) {
      for (const payment of payments) {
        // Skip if already synced
        if (payment.qb_payment_id) {
          paymentsSynced++;
          continue;
        }

        try {
          const qbPayment = {
            CustomerRef: { value: qbCustomerId },
            TotalAmt: payment.amount,
            TxnDate: payment.payment_date ? payment.payment_date.split('T')[0] : new Date().toISOString().split('T')[0],
            Line: [{
              Amount: payment.amount,
              LinkedTxn: [{
                TxnId: qbInvoiceId,
                TxnType: 'Invoice'
              }]
            }]
          };

          // Map payment method
          if (payment.payment_method) {
            const methodMap = {
              'credit_card': 'CreditCard',
              'cash': 'Cash',
              'check': 'Check',
              'bank_transfer': 'EFT',
              'ach': 'EFT',
              'other': 'Other'
            };
            const qbMethod = methodMap[payment.payment_method] || payment.payment_method;
            qbPayment.PaymentMethodRef = { value: qbMethod };
          }

          if (payment.reference_number) {
            qbPayment.PaymentRefNum = payment.reference_number;
          }

          const payResult = await qbRequest('POST', '/payment', qbPayment);

          // Update payment with QB ID
          await supabase
            .from('payments')
            .update({ qb_payment_id: payResult.Payment.Id })
            .eq('id', payment.id);

          paymentsSynced++;
        } catch (payErr) {
          console.error('Failed to sync payment:', payment.id, payErr.message);
        }
      }
    }

    return {
      statusCode: 200,
      headers: corsHeaders(),
      body: JSON.stringify({
        success: true,
        qb_invoice_id: qbInvoiceId,
        payments_synced: paymentsSynced,
        message: `Invoice and ${paymentsSynced} payment(s) synced to QuickBooks`
      })
    };
    
  } catch (err) {
    console.error('QB sync invoice error:', err);
    return {
      statusCode: 500,
      headers: corsHeaders(),
      body: JSON.stringify({ error: err.message })
    };
  }
};

// Helper to sync customer if not already synced
async function syncCustomer(customer) {
  // Check if customer with this email already exists in QB
  let existingQBCustomer = null;
  if (customer.email) {
    try {
      const query = `SELECT * FROM Customer WHERE PrimaryEmailAddr = '${customer.email.replace(/'/g, "\\'")}'`;
      const searchResult = await qbRequest('GET', `/query?query=${encodeURIComponent(query)}`);
      if (searchResult.QueryResponse?.Customer?.length > 0) {
        existingQBCustomer = searchResult.QueryResponse.Customer[0];
      }
    } catch (e) {
      console.log('Customer search failed:', e.message);
    }
  }
  
  if (existingQBCustomer) {
    return { qb_customer_id: existingQBCustomer.Id };
  }
  
  // Create new customer
  const nameParts = (customer.name || '').trim().split(' ');
  const qbCustomer = {
    DisplayName: customer.name || customer.email || 'Unknown Customer',
    GivenName: nameParts[0] || undefined,
    FamilyName: nameParts.slice(1).join(' ') || undefined,
    PrimaryEmailAddr: customer.email ? { Address: customer.email } : undefined,
    PrimaryPhone: customer.phone ? { FreeFormNumber: customer.phone } : undefined,
    BillAddr: customer.address ? { Line1: customer.address } : undefined
  };
  
  Object.keys(qbCustomer).forEach(key => {
    if (qbCustomer[key] === undefined) delete qbCustomer[key];
  });
  
  const result = await qbRequest('POST', '/customer', qbCustomer);
  return { qb_customer_id: result.Customer.Id };
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };
}
