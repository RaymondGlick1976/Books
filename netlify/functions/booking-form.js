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

  try {
    const slug = event.queryStringParameters?.slug || 'default';
    
    // Get form by slug
    const { data: form, error: formError } = await supabase
      .from('booking_forms')
      .select('*')
      .eq('slug', slug)
      .eq('is_active', true)
      .single();
    
    if (formError || !form) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'Form not found' })
      };
    }
    
    // Get custom questions
    const { data: questions } = await supabase
      .from('booking_form_questions')
      .select('*')
      .eq('form_id', form.id)
      .order('sort_order');
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        form,
        questions: questions || []
      })
    };
    
  } catch (err) {
    console.error('Error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Server error' })
    };
  }
};
