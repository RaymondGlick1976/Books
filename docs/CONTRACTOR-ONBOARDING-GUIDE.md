# Contractor Onboarding Guide

A step-by-step checklist for setting up a new contractor with their own HCD Books instance.

---

## Pre-Onboarding Information

Collect this information from the contractor before starting:

- [ ] Company name
- [ ] Company email
- [ ] Company phone
- [ ] Company address (street, city, state, zip)
- [ ] Website URL (if any)
- [ ] Logo image file (PNG or GIF, ideally 200px wide)
- [ ] GitHub username (their own account — free to create if they don't have one; needed for Step 1)
- [ ] Desired subdomain (e.g., `smithcabinets` → `smithcabinets-books.netlify.app`)
- [ ] Custom domain (optional, e.g., `portal.smithcabinets.com`)
- [ ] Admin user's name and email (for first login)
- [ ] Do they need Stripe for payments? (Y/N)
- [ ] Do they need QuickBooks integration? (Y/N)

---

## Step 1: Fork the Template on GitHub

**Time: ~5 minutes**

Everything the contractor uses should live under accounts *they* own — GitHub included. This step hands them a private copy of the codebase that's fully theirs, while keeping you able to push updates to it later.

**One-time setup (only needs doing once, ever — not per contractor):**

1. [ ] Confirm the template repo (`quote-app-template`) is private, owned by your GitHub account
2. [ ] Go to the repo's **Settings → General → Features** and check **"Allow forking"** — skip this if it's already been done for a previous contractor

**Per contractor:**

1. [ ] Go to the template repo → **Settings → Collaborators** → **Add people** → invite their GitHub username
2. [ ] Have them accept the invite (check their email or GitHub notifications)
3. [ ] On a screen-share, have them log into their own GitHub account, open the template repo, and click **Fork** (top right)
4. [ ] They choose their own account as the destination — this creates a private repo fully owned by them (e.g. `their-username/quote-app-template`)
5. [ ] Confirm you have access to their new fork — GitHub usually auto-grants the template's collaborators access to new forks. If you only land with read access, ask them to add you as a collaborator with **Write** permission so you can push updates later
6. [ ] Note their fork's repo URL — you'll connect it to Netlify in Step 5

**Alternative:** if you'd rather not share commit history with contractors, mark the template as a **Template repository** (Settings → check "Template repository") and have them click **Use this template** instead of Fork. Same access requirements, but it creates a fresh repo with no shared git history. If you use this method, you'll need to manually add the template as a remote later (see *Maintenance Notes* below) since GitHub won't track a fork relationship automatically.

---

## Step 2: Create Supabase Project

**Time: ~10 minutes**

1. [ ] Go to [supabase.com](https://supabase.com) and log in
2. [ ] Click **"New Project"**
3. [ ] Fill in:
   - **Name:** `[contractor-name]-books` (e.g., `smith-cabinets-books`)
   - **Database Password:** Generate a strong password and save it somewhere secure
   - **Region:** Choose closest to contractor (e.g., `us-east-1` for East Coast US)
4. [ ] Click **"Create new project"** and wait for setup (~2 minutes)
5. [ ] Once ready, go to **Settings → API** and copy:
   - [ ] **Project URL** → Save as `SUPABASE_URL`
   - [ ] **anon public key** → Save as `SUPABASE_ANON_KEY`
   - [ ] **service_role secret key** → Save as `SUPABASE_SERVICE_ROLE_KEY`

---

## Step 3: Run Database Migrations

**Time: ~5 minutes**

1. [ ] In Supabase, go to **SQL Editor**
2. [ ] Click **"New Query"**
3. [ ] Run these files **in order** (copy/paste contents and click "Run"):

| Order | File | Description |
|-------|------|-------------|
| 1 | `database/schema.sql` | Core tables |
| 2 | `database/migration-users.sql` | User roles & permissions |
| 3 | `database/migration-pipeline-complete.sql` | Pipeline stages |
| 4 | `database/migration-booking-forms.sql` | Booking forms |
| 5 | `database/migration-email-templates.sql` | Email templates |
| 6 | `database/migration-lead-sources.sql` | Lead sources |
| 7 | `database/migration-appointments.sql` | Appointments |
| 8 | `database/migration-packages.sql` | Quote packages |
| 9 | `database/migration-change-orders.sql` | Change orders |

4. [ ] Verify tables were created: Go to **Table Editor** and confirm you see tables like `customers`, `jobs`, `quotes`, `booking_forms`, etc.

---

## Step 4: Set Up Supabase Storage

**Time: ~2 minutes**

1. [ ] In Supabase, go to **Storage**
2. [ ] Click **"New Bucket"**
3. [ ] Create bucket named: `uploads`
4. [ ] Set to **Public** bucket
5. [ ] Click **"Create bucket"**

---

## Step 5: Deploy to Netlify

**Time: ~5 minutes**

### Option A: From their GitHub fork (recommended)

1. [ ] Go to [netlify.com](https://netlify.com) and log in with the contractor's own account
2. [ ] Click **"Add new site"** → **"Import an existing project"**
3. [ ] Connect to GitHub and authorize Netlify to access their account
4. [ ] Select their forked repo from Step 1
5. [ ] Confirm build settings and deploy
6. [ ] Click **"Site settings"** → **"Change site name"**
7. [ ] Set name to `[contractor-name]-books` (e.g., `smith-cabinets-books`)

This connects hosting entirely to the contractor's own accounts (GitHub + Netlify) — no dependency on you for uptime or deploys going forward, and pushes to their fork auto-deploy.

### Option B: From ZIP file (only if not using the GitHub fork workflow)

1. [ ] Go to [netlify.com](https://netlify.com) and log in
2. [ ] Click **"Add new site"** → **"Deploy manually"**
3. [ ] Drag and drop the `Books` folder (extracted from latest zip)
4. [ ] Wait for deploy to complete
5. [ ] Click **"Site settings"** → **"Change site name"**
6. [ ] Set name to `[contractor-name]-books` (e.g., `smith-cabinets-books`)

Note: ZIP deploys don't auto-update from git pushes — if you use this option, future updates have to be manually re-uploaded rather than pushed.

---

## Step 6: Configure Environment Variables

**Time: ~5 minutes**

1. [ ] In Netlify, go to **Site settings** → **Environment variables**
2. [ ] Add these variables:

### Required Variables

| Variable | Value | Notes |
|----------|-------|-------|
| `SUPABASE_URL` | `https://xxxxx.supabase.co` | From Step 2 |
| `SUPABASE_ANON_KEY` | `eyJhbGc...` | From Step 2 |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJhbGc...` | From Step 2 (keep secret!) |

### Email (Required for notifications)

| Variable | Value | Notes |
|----------|-------|-------|
| `RESEND_API_KEY` | `re_xxxxx` | Get from [resend.com](https://resend.com) |
| `ADMIN_EMAIL` | `contractor@email.com` | Fallback notification email |

### Stripe (If using payments)

| Variable | Value | Notes |
|----------|-------|-------|
| `STRIPE_SECRET_KEY` | `sk_live_xxxxx` | From Stripe dashboard |
| `STRIPE_PUBLISHABLE_KEY` | `pk_live_xxxxx` | From Stripe dashboard |
| `STRIPE_WEBHOOK_SECRET` | `whsec_xxxxx` | From Stripe webhook setup |

### QuickBooks (If using)

| Variable | Value | Notes |
|----------|-------|-------|
| `QB_CLIENT_ID` | `xxxxx` | From QuickBooks developer |
| `QB_CLIENT_SECRET` | `xxxxx` | From QuickBooks developer |
| `QB_REDIRECT_URI` | `https://[site].netlify.app/.netlify/functions/qb-callback` | |

3. [ ] Click **"Save"**
4. [ ] Go to **Deploys** → **Trigger deploy** → **"Deploy site"** (to pick up new env vars)

---

## Step 7: Customize Branding (Optional)

**Time: ~5 minutes**

### Replace Logo

1. [ ] Get contractor's logo file (PNG or GIF)
2. [ ] Rename to `logo.gif` (or `logo.png`)
3. [ ] In the project files, replace `public/images/logo.gif`
4. [ ] Redeploy to Netlify

### Update Default Colors (if requested)

1. [ ] Edit `public/css/styles.css`
2. [ ] Find `:root` section near top
3. [ ] Change `--color-primary: #6366f1;` to contractor's brand color
4. [ ] Redeploy

---

## Step 8: Create Admin User

**Time: ~2 minutes**

1. [ ] Visit the site: `https://[contractor-name]-books.netlify.app/admin/login.html`
2. [ ] Click **"Sign Up"** or **"Create Account"**
3. [ ] Enter admin user's email and a temporary password
4. [ ] Log in and verify access to dashboard

---

## Step 9: Configure App Settings

**Time: ~10 minutes**

Log into the admin panel and configure:

### Company Info (Settings → Company)
- [ ] Company name
- [ ] Email address
- [ ] Notification email (if different)
- [ ] Phone number
- [ ] Address, city, state, zip
- [ ] Website

### Quote Settings (Settings → Quote)
- [ ] Default valid days (usually 30)
- [ ] Default tax rate (varies by state)
- [ ] Default deposit percentage

### Lead Sources (Settings → Lead Sources)
- [ ] Add relevant lead sources:
  - Google
  - Facebook
  - Referral
  - Home Show
  - Houzz
  - etc.

### Pipeline Stages (Deals Pipeline → Stages)
- [ ] Review default stages
- [ ] Add/modify stages as needed for their workflow

### Booking Form (Lead Capture → Booking Forms)
- [ ] Edit the default booking form
- [ ] Update header title and description
- [ ] Set brand color
- [ ] Configure which fields to show
- [ ] Get embed code for their website

---

## Step 10: Set Up Email (Resend)

**Time: ~10 minutes**

If contractor needs email notifications:

1. [ ] Go to [resend.com](https://resend.com) and create account (contractor's own account)
2. [ ] **Add domain** (recommended) or use Resend's test domain
3. [ ] If adding domain:
   - Add the contractor's domain
   - Add DNS records (MX, TXT for SPF/DKIM) — contractor does this themselves or grants temporary DNS access
   - Verify domain
4. [ ] Create API key and add to Netlify environment variables
5. [ ] Test by submitting a booking form

---

## Step 11: Set Up Stripe (If Using Payments)

**Time: ~15 minutes**

1. [ ] Contractor creates Stripe account at [stripe.com](https://stripe.com) — always their own account, never yours
2. [ ] Complete Stripe onboarding/verification
3. [ ] Contractor gets API keys from **Developers → API Keys** and shares just the keys with you — you should never need their Stripe login
4. [ ] Set up webhook:
   - Go to **Developers → Webhooks**
   - Add endpoint: `https://[site].netlify.app/.netlify/functions/stripe-webhook`
   - Select events: `payment_intent.succeeded`, `checkout.session.completed`
   - Copy webhook signing secret
5. [ ] Add all Stripe keys to Netlify environment variables
6. [ ] Redeploy site
7. [ ] Test with a small payment

---

## Step 12: Custom Domain (Optional)

**Time: ~10 minutes**

If contractor wants their own domain (e.g., `portal.smithcabinets.com`):

1. [ ] In Netlify, go to **Domain settings** → **Add custom domain**
2. [ ] Enter the domain (e.g., `portal.smithcabinets.com`)
3. [ ] Add DNS records at contractor's domain registrar:
   - **CNAME** record: `portal` → `[site-name].netlify.app`
   - Or **A** record to Netlify's load balancer IP
4. [ ] Wait for DNS propagation (up to 24 hours)
5. [ ] Enable HTTPS (Netlify does this automatically)

---

## Step 13: Final Testing Checklist

Test these features before handing off:

### Core Functions
- [ ] Admin login works
- [ ] Dashboard loads with stats
- [ ] Can create a new customer
- [ ] Can create a new deal in pipeline
- [ ] Can drag deals between stages
- [ ] Calendar view works

### Quotes
- [ ] Can create a new quote
- [ ] Can add line items
- [ ] Can preview quote
- [ ] Can send quote email (if email configured)

### Booking Form
- [ ] Booking form loads on standalone page (`/book/default`)
- [ ] Embed code works (test on a simple HTML page)
- [ ] Form submission creates customer and deal
- [ ] Email notification received (if configured)

### Payments (if Stripe configured)
- [ ] Can create invoice
- [ ] Customer can pay invoice
- [ ] Payment shows in Stripe dashboard

---

## Step 14: Handoff to Contractor

Provide the contractor with:

1. [ ] **Login URL:** `https://[their-site].netlify.app/admin/login.html`
2. [ ] **Admin credentials** (or have them set their own)
3. [ ] **Customer portal URL:** `https://[their-site].netlify.app/portal/login.html`
4. [ ] **Booking form embed code** (from Booking Forms settings)
5. [ ] **Quick start guide** (create a simple PDF or doc)
6. [ ] **Support contact** (your email/phone for questions)
7. [ ] **Confirmation of what they own vs. what's paid separately** — remind them their GitHub fork, Supabase project, Netlify site, and any Resend/Stripe accounts are fully theirs; updates and ongoing support are a separate purchase if they haven't already added it

---

## Troubleshooting Common Issues

### "Unable to load" errors
- Check Supabase URL and keys in Netlify env vars
- Make sure you ran all database migrations
- Check browser console for specific errors

### Emails not sending
- Verify RESEND_API_KEY is set correctly
- Check Resend dashboard for failed sends
- Verify domain is properly configured in Resend

### Booking form not working
- Check that `booking_forms` table has at least one active form
- Verify the form slug matches what's in the embed code
- Check browser console for CORS or API errors

### Stripe payments failing
- Verify all three Stripe keys are set
- Check webhook is configured with correct URL
- Look at Stripe dashboard for error details

### Can't fork the template repo / "Fork" button missing
- Confirm "Allow forking" is checked in the template repo's Settings → General → Features
- Confirm the contractor actually accepted the collaborator invite before trying to fork — a pending invite doesn't grant access

### You don't have push access to a contractor's fork
- Ask them to add you as a collaborator on their fork with **Write** permission (Settings → Collaborators, on their repo, not the template)
- This can happen if the auto-granted access from the fork only came through as read-only

---

## Maintenance Notes

### Updating the App

Because each contractor has their own fork (Step 1), updates are pushed per-fork rather than redeployed centrally:

1. [ ] Make and test the fix/feature in the template repo (`quote-app-template`), push to its `main` branch
2. [ ] For each contractor's fork (you should have write access from Step 1):
   ```
   git clone <their-fork-url>
   cd <repo-folder>
   git remote add upstream <template-repo-url>   # only needed the first time for this fork
   git fetch upstream
   git merge upstream/main
   git push origin main
   ```
3. [ ] Netlify auto-deploys on push — no manual redeploy needed if they're on the GitHub-connected setup from Step 5, Option A
4. [ ] If the update includes a schema change, run the new migration file in each contractor's Supabase SQL Editor manually (schema changes don't travel through git)
5. [ ] For contractors on the ZIP-deploy path (Step 5, Option B), you'll need to manually re-zip and re-upload instead of steps 2–3

This is the deliverable behind a paid "updates" plan — batch it across contractors on a schedule (e.g., monthly) rather than doing it ad hoc per request.

### Monitoring
- Set up Netlify email notifications for deploy failures
- Periodically check Supabase for database size/limits
- Monitor Resend for email delivery issues

---

## Contractor Setup Tracking

Use this table to track onboarding progress:

| Contractor | GitHub | Supabase | Netlify | Env Vars | Settings | Email | Stripe | Handed Off |
|------------|--------|----------|---------|----------|----------|-------|--------|------------|
| Example Co | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | N/A | ✅ |
| | | | | | | | | |
| | | | | | | | | |

---

*Last updated: August 2026*
