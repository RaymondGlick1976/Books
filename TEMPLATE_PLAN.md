# Multi-Business Template Architecture Plan

**Status:** Proposal — for review before any code moves
**Strategy:** Option 2 — Fork + upstream pulls
**Date:** 2026-06-01

---

## 1. The Big Picture

Three GitHub repos:

```
quote-app-template          ← shared codebase, no business-specific data
  ├── homestead-quote-app   ← fork, contains only HCD config + overrides
  └── g2construction-app    ← fork, contains only G2 config + overrides
       (and more in future)
```

Each fork tracks the template as `upstream`. Bug fixes pushed to the template flow to every business with `git pull upstream main`. Business-specific code lives in **one place** (`config/`), so merges almost never conflict.

---

## 2. What Lives Where

### In the template (changes flow to everyone)

- All HTML, JS, CSS in `public/`
- All Netlify Functions in `netlify/`
- Database schema in `database/schema.sql`
- Build script `scripts/inject-env.js` (extended — see §4)
- The placeholder `config/business.json.example`

### In each fork (business-specific, won't be touched by upstream pulls)

- `config/business.json` — the only file each business owns
- `public/assets/logo.svg` (and any other custom images)
- `.env` for local dev — **never committed**
- Netlify dashboard env vars (set per-site, not in code)

### What does NOT go in either

- Customer data, quotes, invoices, file uploads — these live in **per-business Supabase projects**

---

## 3. The Config File

Each business repo's `config/business.json` looks like this:

```json
{
  "business": {
    "name": "G2 Construction",
    "shortName": "G2",
    "legalName": "G2 Construction LLC",
    "tagline": "Quality construction you can trust"
  },
  "contact": {
    "email": "info@g2construction.com",
    "fromEmail": "noreply@g2construction.com",
    "ccEmail": "info@g2construction.com",
    "phone": "(555) 123-4567",
    "address": "123 Main St",
    "city": "Springfield",
    "state": "MA",
    "zip": "01103"
  },
  "domain": {
    "primary": "g2construction.com",
    "siteUrl": "https://quotes.g2construction.com"
  },
  "branding": {
    "colors": {
      "primary": "#1e40af",
      "primaryLight": "#3b82f6",
      "primaryDark": "#1e3a8a",
      "accent": "#1e40af",
      "bgDark": "#0f172a"
    },
    "fonts": {
      "display": "Inter, -apple-system, sans-serif",
      "body": "Inter, -apple-system, sans-serif"
    },
    "logo": "/assets/logo.svg"
  },
  "terminology": {
    "job": "project",
    "estimate": "estimate",
    "quote": "estimate"
  },
  "features": {
    "specSheets": false,
    "punchList": true,
    "vendorManagement": true,
    "googlePhotos": false
  },
  "defaults": {
    "quoteValidDays": 30,
    "depositPercent": 25,
    "invoiceDueDays": 30,
    "taxRate": 0.0625
  }
}
```

This file is **the entire customization surface** for a new business. Nothing else in the repo should need to change.

---

## 4. How the Config Reaches the Code

The existing setup already does some of this — there's a `settings` table in Supabase with a `company` row holding JSON. The new pattern extends that idea.

### Two layers:

**Build-time injection** (HTML / CSS / static JS): Extend `scripts/inject-env.js` to also load `config/business.json` and replace tokens during Netlify build:

```html
<!-- Template source -->
<title>Dashboard | __BUSINESS_NAME__</title>

<!-- After build -->
<title>Dashboard | G2 Construction</title>
```

```css
/* Template source */
:root {
  --color-primary: __BRAND_PRIMARY__;
}

/* After build */
:root {
  --color-primary: #1e40af;
}
```

Tokens are simple `__UPPER_SNAKE__` placeholders that get text-replaced. No JS framework, no build complexity — just extending what `inject-env.js` already does for Supabase keys.

**Runtime / DB seed**: On first deploy, `database/schema.sql` seeds the `settings.company` row from the same `config/business.json`. Netlify Functions and admin pages already read from `settings.company`, so they keep working unchanged. The build-time tokens cover the *static* business identity (page titles, CSS colors, email signatures); the DB covers anything editable from the admin Settings page.

This dual approach matches how the code already works — minimal restructuring.

---

## 5. CSS Theming Approach

Today, `public/css/styles.css` has hardcoded HCD colors at the top (`#38571a` green). After the template change:

1. Move the color values into `config/business.json → branding.colors`
2. Rewrite the `:root` block in `styles.css` to use tokens: `--color-primary: __BRAND_PRIMARY__;`
3. `inject-env.js` replaces tokens during build
4. **Everything else in styles.css stays as-is** — all other rules already use the CSS variables, so theming "just works" once the root variables are correct

Logo: each fork drops its own `public/assets/logo.svg` (or PNG). Filename and path are constant — the HTML references `/assets/logo.svg` and lets the file system handle the swap.

---

## 6. Survey of What Needs to Change

From scanning the actual codebase:

- **~50 HTML files** mention "Homestead Cabinet Design" — almost entirely in `<title>` tags, headers, and email signatures. Replaceable with `__BUSINESS_NAME__` token.
- **6 spec-sheet files** have `homesteadcabinetdesign.com · raymond@homesteadcabinetdesign.com` footers. Token-replaceable.
- **8 Netlify functions** have fallback strings like `'noreply@homesteadcabinetdesign.com'`. Switch fallbacks to read from a runtime config helper or env var.
- **3 admin pages** hardcode `value="raymond@homesteadcabinetdesign.com"` as the CC default. Replace with token or pull from `settings.company.email`.
- **`public/css/styles.css`** — ~10 color variables in `:root`. Tokenize.
- **`database/schema.sql`** — line 13 seeds `settings.company`. Replace the inline JSON with values from `config/business.json` (a small build-step generator can write a `seed.sql` per-instance).
- **`public/index.html`** — landing page. Mentions business name once. Token-replaceable.

Nothing else is HCD-specific. The catalog, pricing attributes, email templates, etc. are all already DB-driven and per-business.

---

## 7. Git Workflow (Fork + Upstream)

### Creating a new business

```bash
# 1. On GitHub: fork quote-app-template → name it g2construction-app
# 2. Clone the fork locally
git clone git@github.com:raymond/g2construction-app.git
cd g2construction-app

# 3. Add the template as upstream
git remote add upstream git@github.com:raymond/quote-app-template.git
git fetch upstream

# 4. Create config/business.json from the example
cp config/business.json.example config/business.json
# edit it with G2's info

# 5. Drop in the logo
cp ~/Downloads/g2-logo.svg public/assets/logo.svg

# 6. Commit and push
git add config/business.json public/assets/logo.svg
git commit -m "Initial G2 Construction config"
git push origin main
```

### Receiving template updates

```bash
cd g2construction-app
git fetch upstream
git merge upstream/main
# resolve any conflicts (rare if you only edit config/)
git push origin main
```

Netlify auto-deploys on push.

### When to push to the template vs. a fork

- **Bug fix in shared code** → push to `quote-app-template`, then pull into each fork
- **New feature both businesses need** → push to template
- **G2-only customization** → push only to `g2construction-app`. If two businesses end up needing the same customization, refactor it into the template.

### Conflict avoidance rules

1. **Never edit shared files in a fork.** All custom values go through `config/business.json`.
2. **If you need a one-off in a fork**, prefer a feature flag in config (`features.specSheets: false`) over editing the HTML directly.
3. **If a fork must edit a shared file**, document why in `config/CUSTOMIZATIONS.md` so you remember during upstream pulls.

---

## 8. Per-Instance Infrastructure Checklist

Each business needs its own:

- [ ] **GitHub fork** of the template
- [ ] **Supabase project** (run `database/schema.sql` after `config/business.json` is set)
- [ ] **Stripe account** (or restricted key on a shared account) — Publishable + Secret + Webhook Secret
- [ ] **Resend domain** verified for `noreply@<business-domain>`
- [ ] **Netlify site** connected to the fork, with env vars:
  - `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
  - `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`
  - `RESEND_API_KEY`
  - `ADMIN_EMAIL`, `SITE_URL`
  - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `BOOKING_TOKEN_SECRET`
- [ ] **Custom domain** pointed at the Netlify site
- [ ] **Stripe webhook** endpoint registered, pointing at `<site>/.netlify/functions/stripe-webhook`

A `NEW_BUSINESS_SETUP.md` checklist in the template will track this.

---

## 9. Migration Path for HCD

HCD is currently *not* using the template structure — it's a vanilla repo. After the template is built:

**Option A — Adopt the template (recommended later):**
1. Create the template repo by copying HCD's current files
2. Strip HCD-specific values into `config/business.json` and tokenize the source
3. Push to template
4. Convert HCD's repo to a fork of the template (one-time `git` history rewrite, or just blow away HCD's local history and start fresh)
5. HCD's `config/business.json` has the green branding, raymond@, etc.

**Option B — Leave HCD alone for now:**
1. Build the template
2. Use it for G2 only
3. Migrate HCD whenever you have time

I'd recommend **Option A** when you do the template work — converting HCD at the same time is cheaper than doing it twice, and ensures the template stays honest (if HCD can't run on it, neither can anyone else).

---

## 10. Open Decisions

These aren't blockers but should be settled before instance #3:

1. **Logo file format.** SVG preferred (scalable, themeable), PNG fallback for businesses without a vector logo.
2. **Email "from" name format.** Right now hardcoded `'Homestead Cabinet Design <noreply@...>'`. Switch to read from config.
3. **Catalog seed.** Each business starts with an empty catalog. Should the template ship sample/seed catalog items, or always blank?
4. **Spec sheets.** Currently 6 cabinet-specific spec sheets. Hide behind `features.specSheets` flag — G2 wouldn't use them.
5. **Tax rate handling.** Currently in `quote_defaults.tax_rate` in DB. Should `config/business.json` also seed this? (Probably yes.)
6. **Multi-state / nexus.** Some businesses operate in multiple states with different tax rates. Out of scope for v1.

---

## 11. Scope of First Build (When You're Ready)

When you give the green light, the first phase of actual work is:

1. Create `quote-app-template` repo from current HCD code
2. Add `config/business.json.example`
3. Extend `scripts/inject-env.js` to inject config tokens
4. Tokenize `styles.css` (CSS variables)
5. Tokenize `<title>` tags and visible business-name text across HTML (script-driven, not 50 manual edits)
6. Tokenize email "from" strings in Netlify functions
7. Add feature flag checks for `specSheets`
8. Write `NEW_BUSINESS_SETUP.md` checklist
9. Fork to create G2 instance, fill in `config/business.json`, deploy
10. (Later) Migrate HCD onto the template

Estimated effort: most of the work is mechanical token replacement. The interesting design work is already done in this plan.

---

## 12. What You Should Look At in This Plan

Before we cut any code, please review:

- **§3 config schema** — does this cover everything each business needs? Anything missing?
- **§4 build-time vs. runtime split** — comfortable with the dual approach, or prefer one or the other?
- **§7 git workflow** — happy with fork+upstream, or want a different ergonomic?
- **§9 HCD migration** — Option A (migrate HCD onto template) or Option B (leave HCD alone)?
- **§10 open decisions** — any you want to settle now?

Once you sign off, I'll start building.
