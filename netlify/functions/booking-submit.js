const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const data = JSON.parse(event.body);
    
    // Validate required fields
    if (!data.first_name || !data.last_name || !data.email) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Missing required fields' })
      };
    }
    
    // Get form config
    const { data: form } = await supabase
      .from('booking_forms')
      .select('*')
      .eq('id', data.form_id)
      .single();
    
    const defaultStage = form?.default_stage || 'new-lead';
    
    // Check if customer exists
    let customerId;
    const { data: existingCustomer } = await supabase
      .from('customers')
      .select('id')
      .eq('email', data.email.toLowerCase())
      .single();
    
    if (existingCustomer) {
      customerId = existingCustomer.id;
    } else {
      // Create new customer
      const { data: newCustomer, error: custError } = await supabase
        .from('customers')
        .insert([{
          name: `${data.first_name} ${data.last_name}`,
          email: data.email.toLowerCase(),
          phone: data.phone || null,
          address: data.address || null,
          city: data.city || null,
          state: data.state || null,
          zip: data.zip || null
        }])
        .select()
        .single();
      
      if (custError) throw custError;
      customerId = newCustomer.id;
    }
    
    // Upload attachments to Supabase Storage
    const attachmentUrls = [];
    if (data.attachments && data.attachments.length > 0) {
      for (let i = 0; i < data.attachments.length; i++) {
        const base64 = data.attachments[i];
        
        // Extract base64 data
        const matches = base64.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        if (!matches) continue;
        
        const contentType = matches[1];
        const buffer = Buffer.from(matches[2], 'base64');
        const ext = contentType.split('/')[1] || 'jpg';
        const filename = `booking/${Date.now()}_${i}.${ext}`;
        
        const { error: uploadError } = await supabase.storage
          .from('uploads')
          .upload(filename, buffer, { contentType });
        
        if (!uploadError) {
          const { data: urlData } = supabase.storage.from('uploads').getPublicUrl(filename);
          attachmentUrls.push(urlData.publicUrl);
        }
      }
    }
    
    // Generate job number
    const { data: jobNumber } = await supabase.rpc('generate_job_number');
    
    // Create deal
    const dealName = `${data.first_name} ${data.last_name} - ${form?.name || 'Web Request'}`;
    const { data: deal, error: dealError } = await supabase
      .from('jobs')
      .insert([{
        job_number: jobNumber,
        name: dealName,
        customer_id: customerId,
        stage: defaultStage,
        notes: data.service_details || '',
      }])
      .select()
      .single();
    
    if (dealError) throw dealError;
    
    // Create submission record
    const { error: subError } = await supabase
      .from('booking_submissions')
      .insert([{
        form_id: data.form_id,
        customer_id: customerId,
        deal_id: deal.id,
        first_name: data.first_name,
        last_name: data.last_name,
        email: data.email,
        phone: data.phone || null,
        address: data.address || null,
        city: data.city || null,
        state: data.state || null,
        zip: data.zip || null,
        service_details: data.service_details || null,
        how_heard: data.how_heard || null,
        preferred_date: data.preferred_date || null,
        preferred_time: data.preferred_time || null,
        sms_consent: data.sms_consent || false,
        custom_answers: data.custom_answers || {},
        attachments: attachmentUrls
      }]);
    
    if (subError) throw subError;
    
    // Update submission count
    await supabase
      .from('booking_forms')
      .update({ submission_count: (form?.submission_count || 0) + 1 })
      .eq('id', data.form_id);
    
    // Send notification email (if configured)
    // TODO: Add email notification here
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        success: true,
        customer_id: customerId,
        deal_id: deal.id
      })
    };
    
  } catch (err) {
    console.error('Submission error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Failed to submit form: ' + err.message })
    };
  }
};
