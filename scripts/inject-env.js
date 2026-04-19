const fs = require('fs');

const file = 'public/js/utils.js';
let content = fs.readFileSync(file, 'utf8');

content = content
  .replace('__SUPABASE_URL__', process.env.SUPABASE_URL)
  .replace('__SUPABASE_ANON_KEY__', process.env.SUPABASE_ANON_KEY)
  .replace('__STRIPE_PUBLISHABLE_KEY__', process.env.STRIPE_PUBLISHABLE_KEY)
  .replace('__SITE_URL__', process.env.SITE_URL);

fs.writeFileSync(file, content);
console.log('Environment variables injected successfully');
