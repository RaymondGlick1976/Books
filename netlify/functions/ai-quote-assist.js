// =============================================
// AI QUOTE ASSIST - Match job description to catalog items
// =============================================

const Anthropic = require('@anthropic-ai/sdk');
const { getSupabase, success, error, handleCors, parseBody } = require('./utils');

exports.handler = async (event) => {
  const corsResponse = handleCors(event);
  if (corsResponse) return corsResponse;

  if (event.httpMethod !== 'POST') {
    return error('Method not allowed', 405);
  }

  const { prompt } = parseBody(event);
  if (!prompt || typeof prompt !== 'string') {
    return error('Missing or invalid "prompt" field', 400);
  }

  // 1. Fetch active catalog items
  const supabase = getSupabase();
  const { data: catalog, error: catalogError } = await supabase
    .from('items_catalog')
    .select('id, name, default_price')
    .eq('is_active', true);

  if (catalogError) {
    console.error('Catalog fetch error:', catalogError);
    return error('Failed to fetch catalog items: ' + catalogError.message, 500);
  }

  // 2. Call Claude
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  let message;
  try {
    message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: 'You are a quoting assistant for a cabinet contracting business. Match the job description to catalog items only. Never invent items or prices. Flag anything you cannot match. Return only valid JSON, no prose, no markdown.',
      messages: [
        {
          role: 'user',
          content: `Job description:\n${prompt}\n\nCatalog:\n${JSON.stringify(catalog)}\n\nReturn this exact JSON structure:\n{ "line_items": [{ "catalog_item_id": "", "name": "", "quantity": 0 }], "unmatched": [], "notes": "" }`,
        },
      ],
    });
  } catch (err) {
    console.error('Claude API error:', err);
    return error('AI service error: ' + err.message, 502);
  }

  // 3. Parse Claude's response
  let parsed;
  try {
    const raw = message.content[0].text;
    parsed = JSON.parse(raw);
  } catch (err) {
    console.error('JSON parse error:', err);
    return error('Failed to parse AI response as JSON', 502);
  }

  // 4. Enrich line items with pricing from catalog
  const catalogMap = Object.fromEntries(catalog.map((c) => [c.id, c]));

  const enrichedLineItems = (parsed.line_items || []).map((item) => {
    const catalogItem = catalogMap[item.catalog_item_id];
    const unitPrice = catalogItem ? catalogItem.default_price : 0;
    return {
      ...item,
      unit_price: unitPrice,
      unit: 'each',
      line_total: unitPrice * (item.quantity || 0),
    };
  });

  return success({
    line_items: enrichedLineItems,
    unmatched: parsed.unmatched || [],
    notes: parsed.notes || '',
  });
};
