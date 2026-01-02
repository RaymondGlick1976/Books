# Homestead Cabinet Design - Quote & Invoice System

A complete quoting and invoicing system for Homestead Cabinet Design, built with plain HTML/CSS/JS, Supabase, Netlify Functions, and Stripe.

## Features

### Customer Portal
- **Magic link authentication** - No passwords needed
- **Interactive quotes** - Customers can toggle optional items
- **Online payments** - Stripe integration for deposits and payments
- **File uploads** - Customers can share inspiration photos
- **Invoice tracking** - View invoices and payment history

### Admin Dashboard
- **Customer management** - Add, edit, view customers
- **Quote builder** - Create quotes with catalog items or custom entries
- **Invoice creation** - Convert accepted quotes to invoices
- **Payment tracking** - Monitor outstanding balances
- **Catalog management** - Maintain service/product catalog

## Tech Stack

- **Frontend**: Plain HTML, CSS, JavaScript (no build step)
- **Backend**: Netlify Functions (serverless)
- **Database**: Supabase (PostgreSQL)
- **Payments**: Stripe Checkout & Payment Intents
- **Email**: Resend
- **Hosting**: Netlify

## Project Structure

```
quote-app/
├── public/                    # Static files served by Netlify
│   ├── css/
│   │   └── styles.css         # Complete design system
│   ├── js/
│   │   ├── utils.js           # Shared utilities & Supabase client
│   │   └── portal-auth.js     # Portal authentication
│   ├── portal/                # Customer portal pages
│   │   ├── login.html
│   │   ├── verify.html
│   │   ├── dashboard.html
│   │   ├── quotes.html
│   │   ├── quote.html
│   │   ├── invoices.html
│   │   ├── files.html
│   │   └── uploads.html
│   └── admin/                 # Admin dashboard pages
│       ├── index.html
│       ├── customers.html
│       ├── quotes.html
│       ├── quote-builder.html
│       └── invoices.html
├── netlify/
│   └── functions/             # Serverless API endpoints
│       ├── portal-login.js
│       ├── portal-verify.js
│       ├── portal-data.js
│       ├── portal-quote.js
│       ├── portal-quotes.js
│       ├── portal-upload.js
│       ├── portal-uploads.js
│       ├── create-checkout.js
│       ├── stripe-webhook.js
│       └── utils.js
├── database/
│   └── schema.sql             # Complete database schema
├── netlify.toml               # Netlify configuration
└── package.json
```

## Setup Instructions

### 1. Supabase Setup

1. Create a new project at [supabase.com](https://supabase.com)
2. Go to SQL Editor and run the contents of `database/schema.sql`
3. Go to Settings → API and note your:
   - Project URL
   - `anon` public key
   - `service_role` secret key

4. Create Storage buckets:
   - `quote-attachments` (private)
   - `customer-uploads` (private)
   - `catalog-photos` (public)

### 2. Stripe Setup

1. Create account at [stripe.com](https://stripe.com)
2. Get your API keys from Developers → API keys:
   - Publishable key
   - Secret key
3. Set up webhook endpoint:
   - URL: `https://your-site.netlify.app/api/stripe-webhook`
   - Events: `checkout.session.completed`, `payment_intent.succeeded`
4. Note the webhook signing secret

### 3. Resend Setup

1. Create account at [resend.com](https://resend.com)
2. Add and verify your domain
3. Create an API key

### 4. Update Configuration

Edit `public/js/utils.js` and update:
```javascript
const CONFIG = {
  SUPABASE_URL: 'https://your-project.supabase.co',
  SUPABASE_ANON_KEY: 'your-anon-key',
  STRIPE_PUBLISHABLE_KEY: 'pk_live_...',
  SITE_URL: 'https://homesteadcabinetdesign.com'
};
```

### 5. Deploy to Netlify

1. Push code to GitHub
2. Connect repo to Netlify
3. Set environment variables in Netlify dashboard:

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
RESEND_API_KEY=re_...
ADMIN_EMAIL=your@email.com
SITE_URL=https://homesteadcabinetdesign.com
```

4. Deploy!

### 6. Test the System

1. **Add a customer** via Admin → Customers
2. **Create a quote** via Admin → Quote Builder
3. **Send quote** to customer
4. **Test login** at /portal/login.html with customer email
5. **Accept quote** and test Stripe payment

## Customization

### Branding
Edit `public/css/styles.css` to change:
- Colors (CSS variables at top)
- Typography (font imports)
- Logo/company name in HTML files

### Tax Rate
Default is 6.25% (MA). Change in:
- `public/admin/quote-builder.html` (TAX_RATE constant)
- `database/schema.sql` (default settings)

### Deposit Settings
Default is 50%. Adjustable per-quote in the quote builder.

## Zapier Integration (QuickBooks)

To sync with QuickBooks Online via Zapier:

1. Create a Zap triggered by webhook
2. Add webhook URL to your Netlify function
3. Set up Zapier actions:
   - Create Customer in QBO
   - Create Invoice in QBO
   - Create Payment in QBO

See the design doc for detailed webhook payloads.

## Security Notes

- Magic links expire after 1 hour
- Session tokens expire after 30 days
- All API calls validate session tokens
- Service role key only used server-side
- File uploads validated for type and size

## Support

For issues or questions, contact the developer.

---

Built for Homestead Cabinet Design
