const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    'Content-Type': 'application/json'
  };

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  try {
    // Check environment variables
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error('Missing environment variables');
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ 
          error: 'Server configuration error',
          details: 'Missing database credentials'
        })
      };
    }

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const slug = event.queryStringParameters?.slug || 'default';
    console.log('Fetching form with slug:', slug);
    
    // Get form by slug
    const { data: form, error: formError } = await supabase
      .from('booking_forms')
      .select('*')
      .eq('slug', slug)
      .eq('is_active', true)
      .single();
    
    if (formError) {
      console.error('Form query error:', formError);
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ 
          error: 'Form not found',
          details: formError.message,
          slug: slug
        })
      };
    }
    
    if (!form) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'Form not found', slug: slug })
      };
    }
    
    // Get custom questions
    const { data: questions, error: questionsError } = await supabase
      .from('booking_form_questions')
      .select('*')
      .eq('form_id', form.id)
      .order('sort_order');

    if (questionsError) {
      console.error('Questions query error:', questionsError);
    }

    // Get branding settings (logo_url)
    const { data: brandingRow } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'branding')
      .maybeSingle();

    const logo_url = brandingRow?.value?.logo_url || null;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        form,
        questions: questions || [],
        logo_url
      })
    };
    
  } catch (err) {
    console.error('Booking form error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Server error',
        message: err.message 
      })
    };
  }
};
