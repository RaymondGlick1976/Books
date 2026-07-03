# Service CRM Starter — Prompt Pack

**A complete guide to building and using a Claude-powered CRM for any small service business.**

*Works with any Claude plan (claude.ai, Claude desktop, or API). No coding required.*

---

## What this gets you

A simple but powerful CRM built on a free Supabase database, operated entirely through conversation with Claude. You'll be able to:

- Add customers and track where they came from
- Create jobs/deals and move them through your sales pipeline
- Schedule appointments and look them up by date
- Query your data any way you want ("how many leads came from Google this month?")

This was originally built for a cabinet refacing company, but it works for any service business — HVAC, plumbing, landscaping, cleaning, remodeling, pest control, roofing, and more.

---

## Part 1: Set Up Your Database

### Step 1.1 — Create a Supabase account

Go to [supabase.com](https://supabase.com) and sign up. It's free.

Click **"New Project"** and fill in:
- **Name:** `[your-business]-crm` (e.g., `smith-plumbing-crm`)
- **Database Password:** Create a strong one and save it
- **Region:** Choose the one closest to you

Click Create and wait about 2 minutes.

### Step 1.2 — Get your API credentials

In your new Supabase project, go to **Settings → API** and copy:
- Project URL (e.g., `https://abcxyz123.supabase.co`)
- `anon` / `public` key
- `service_role` secret key (keep this private)

Save all three — you'll need them to connect Claude.

### Step 1.3 — Run the database schema

In Supabase, click **SQL Editor** in the left sidebar → **New Query**.

Paste the entire schema from the next section and click **Run**. This creates all your tables.

---

## Part 2: The Database Schema

Copy and paste this entire block into your Supabase SQL Editor and run it.

```sql
-- Service CRM Starter Schema
-- Run this once in your Supabase SQL Editor.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Customers
CREATE TABLE IF NOT EXISTS public.customers (
  id uuid NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  name character varying NOT NULL,
  email character varying NOT NULL,
  phone character varying,
  address text,
  city character varying,
  state character varying,
  zip character varying,
  company character varying,
  lead_source character varying,
  notes text,
  assigned_to character varying,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT customers_email_key UNIQUE (email)
);

-- Pipeline Stages
CREATE TABLE IF NOT EXISTS public.job_stages (
  id uuid NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  stage_id character varying NOT NULL,
  label character varying NOT NULL,
  color character varying DEFAULT '#6366f1',
  sort_order integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT job_stages_stage_id_key UNIQUE (stage_id)
);

-- Jobs / Projects / Deals
CREATE TABLE IF NOT EXISTS public.jobs (
  id uuid NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  name character varying NOT NULL,
  customer_id uuid REFERENCES public.customers(id),
  stage character varying DEFAULT 'new-lead' REFERENCES public.job_stages(stage_id),
  estimated_value numeric,
  actual_value numeric,
  job_street character varying,
  job_city character varying,
  job_state character varying,
  job_zip character varying,
  notes text,
  internal_notes text,
  assigned_to character varying,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Appointment Types
CREATE TABLE IF NOT EXISTS public.appointment_types (
  id uuid NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  name character varying NOT NULL,
  color character varying DEFAULT '#6366f1',
  icon character varying DEFAULT '📅',
  sort_order integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now()
);

-- Appointments
CREATE TABLE IF NOT EXISTS public.appointments (
  id uuid NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  appointment_type_id uuid REFERENCES public.appointment_types(id),
  customer_id uuid REFERENCES public.customers(id),
  job_id uuid REFERENCES public.jobs(id),
  title character varying NOT NULL,
  appointment_date date NOT NULL,
  appointment_time time without time zone,
  duration_minutes integer DEFAULT 60,
  location text,
  notes text,
  status character varying DEFAULT 'scheduled',
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Lead Sources
CREATE TABLE IF NOT EXISTS public.lead_sources (
  id uuid NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  name character varying NOT NULL,
  is_active boolean DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT lead_sources_name_key UNIQUE (name)
);

-- App Settings
CREATE TABLE IF NOT EXISTS public.app_settings (
  key text NOT NULL PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamp with time zone DEFAULT now()
);

-- Activity Log
CREATE TABLE IF NOT EXISTS public.activity_log (
  id uuid NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  customer_id uuid REFERENCES public.customers(id),
  activity_type character varying NOT NULL,
  reference_type character varying,
  reference_id uuid,
  description text,
  created_at timestamp with time zone DEFAULT now()
);

-- Default pipeline stages
INSERT INTO public.job_stages (stage_id, label, color, sort_order) VALUES
  ('new-lead',    'New Lead',      '#94a3b8', 0),
  ('estimate',    'Estimate',      '#f59e0b', 1),
  ('proposal',    'Proposal Sent', '#3b82f6', 2),
  ('active',      'Active Job',    '#10b981', 3),
  ('completed',   'Completed',     '#6366f1', 4),
  ('cancelled',   'Cancelled',     '#ef4444', 5)
ON CONFLICT (stage_id) DO NOTHING;

-- Default appointment types
INSERT INTO public.appointment_types (name, color, icon, sort_order) VALUES
  ('On-Site Estimate',  '#f59e0b', '📐', 0),
  ('Site Visit',        '#3b82f6', '🏠', 1),
  ('Phone Call',        '#10b981', '📞', 2),
  ('Project Start',     '#6366f1', '🚀', 3),
  ('Final Walkthrough', '#8b5cf6', '✅', 4),
  ('Other',             '#6b7280', '📅', 5)
ON CONFLICT DO NOTHING;

-- Default lead sources
INSERT INTO public.lead_sources (name, sort_order) VALUES
  ('Google Search',    0),
  ('Facebook',         1),
  ('Referral',         2),
  ('Repeat Customer',  3),
  ('Home Show',        4),
  ('Website',          5),
  ('Other',            6)
ON CONFLICT (name) DO NOTHING;

-- Company settings (update these with your real info)
INSERT INTO public.app_settings (key, value) VALUES
  ('company_name',    '"Your Company Name"'),
  ('company_email',   '"you@yourcompany.com"'),
  ('company_phone',   '"555-555-5555"'),
  ('company_address', '"123 Main St, Your City, ST 00000"'),
  ('tax_rate',        '0'),
  ('currency',        '"USD"')
ON CONFLICT (key) DO NOTHING;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_customers_email ON public.customers(email);
CREATE INDEX IF NOT EXISTS idx_customers_name ON public.customers(name);
CREATE INDEX IF NOT EXISTS idx_jobs_customer_id ON public.jobs(customer_id);
CREATE INDEX IF NOT EXISTS idx_jobs_stage ON public.jobs(stage);
CREATE INDEX IF NOT EXISTS idx_appointments_customer_id ON public.appointments(customer_id);
CREATE INDEX IF NOT EXISTS idx_appointments_date ON public.appointments(appointment_date);
```

After running, go to **Table Editor** and verify you see `customers`, `jobs`, `appointments`, and `job_stages`.

---

## Part 3: Connect Claude to Your Database

### Option A: Using Claude Cowork (recommended for non-technical users)

1. Open Cowork → Settings → Connectors
2. Find Supabase and click Connect
3. Enter your Project ID (the part of your URL between `https://` and `.supabase.co`)
4. Authorize
5. Install the **Service CRM Starter** plugin (`.plugin` file)

### Option B: Using Claude with the Supabase MCP (for developers)

Add this to your Claude MCP config (`.claude/mcp.json` or equivalent):

```json
{
  "mcpServers": {
    "supabase": {
      "command": "npx",
      "args": ["-y", "@supabase/mcp-server-supabase@latest",
               "--project-id", "[YOUR_PROJECT_ID]",
               "--access-token", "[YOUR_SERVICE_ROLE_KEY]"]
    }
  }
}
```

### Option C: Paste the system prompt (works with any Claude)

Start a new Claude conversation and paste this as your first message:

```
You are my CRM assistant. You have access to my Supabase database via the Supabase MCP.

My database has these tables:
- customers (id, name, email, phone, address, city, state, zip, company, lead_source, notes, created_at)
- jobs (id, name, customer_id, stage, estimated_value, job_street, job_city, job_state, job_zip, notes, created_at)
- job_stages (stage_id, label, color, sort_order, is_active)
- appointments (id, appointment_type_id, customer_id, job_id, title, appointment_date, appointment_time, duration_minutes, location, notes, status)
- appointment_types (id, name, color, icon, sort_order, is_active)
- lead_sources (id, name, sort_order, is_active)
- app_settings (key, value)

When I ask you to add a customer, create a job, or schedule an appointment, use the execute_sql tool to insert the records. Always check if a customer exists before creating a duplicate. Confirm dates before inserting appointments. Give me a clean summary after each operation.
```

---

## Part 4: Customize for Your Business

### Rename the pipeline stages

The default stages are generic. Customize them to match how your business actually works.

**Paste this prompt into Claude:**

> I need to set up my sales pipeline. Here are the stages I want: [list your stages here, e.g., "New Lead, Estimate Scheduled, Estimate Sent, Approved, In Progress, Done"]. Please update my job_stages table to match these.

Claude will handle the SQL.

### Add your lead sources

**Paste this prompt:**

> Add these lead sources to my CRM: [list them, e.g., "Nextdoor, Angi, Houzz, Yard Sign, Truck Wrap, Church Referral"]. Keep the existing ones too.

### Set your company info

**Paste this prompt:**

> Update my company settings: company name is "[Your Company]", email is "[your@email.com]", phone is "[phone]", address is "[full address]", and my tax rate is [X]%.

---

## Part 5: Daily Use — Prompts That Work

Copy and adapt these. Claude understands natural language — you don't need to be exact.

### Adding a new customer

> Add a new customer: Sarah Johnson, sarah@gmail.com, 901-555-4872. She's at 456 Maple Ave, Memphis TN 38104. Came from a referral from Mike Davis. Notes: interested in full kitchen remodel.

> New lead — Tom Baker called. Tom Baker, tom@bakerhvac.com, 555-9123. Found us on Google. Wants HVAC tune-up.

### Creating a job

> Create a job for Sarah Johnson — "Kitchen Remodel – Johnson", estimate stage, estimated value $22,000. Job is at her home address.

> Add a service job for Tom Baker — "Annual HVAC Tune-Up", active stage, $185.

### Scheduling an appointment

> Schedule an on-site estimate for Sarah Johnson on June 3rd at 10am at her address. Duration 90 minutes.

> Book a phone call with Tom Baker for this Friday at 2pm.

### Looking things up

> Show me all jobs in the estimate stage.

> What appointments do I have this week?

> Find everything on Sarah Johnson — her contact info, jobs, and appointments.

> How many new leads did I get this month, and where did they come from?

> What's my total estimated value in the pipeline right now?

### Moving a job through the pipeline

> Move the Johnson kitchen job to "Proposal Sent" stage.

> Mark the Baker HVAC tune-up as completed.

### Updating records

> Update Sarah Johnson's phone number to 901-555-6789.

> Add a note to the Johnson kitchen job: "Waiting on cabinet sample selection before finalizing quote."

---

## Part 6: Advanced Queries

These prompts pull useful reports from your data. Paste them directly.

### Pipeline overview
> Give me a full pipeline summary — how many jobs are in each stage and what's the total estimated value in each.

### Monthly lead report
> How many new customers did I add each month this year? Break it down by lead source.

### Revenue tracking
> What's my total estimated value for all active and proposal-stage jobs right now?

### Upcoming schedule
> Show me all my appointments for the next 2 weeks, grouped by day.

### Customer history
> Pull up everything on [customer name] — their contact info, all jobs, and all appointments.

---

## Part 7: Customization Tips

### Using different terminology

If your business calls them "projects" instead of "jobs", just say that and Claude will understand. The database uses `jobs` but you can refer to them however you want in conversation.

### Adding more fields

If you need to track something the default schema doesn't include (like "preferred contact method" or "HOA approval required"), ask Claude:

> I need to track [X] for each customer. Add a column to the customers table called [column_name].

### Building a simple web UI

The data lives in Supabase, which has a built-in Table Editor you can use as a basic admin view. For a full web app, this schema is the same foundation used by HCD Books — a complete field service management app built on Netlify + Supabase.

### Automations

Once your data is in Supabase, you can build automations using Supabase Edge Functions or connect to Zapier/Make to:
- Send confirmation emails when appointments are created
- Get a daily digest of your schedule
- Auto-move jobs to the next stage after certain triggers

---

## Troubleshooting

**"duplicate key value violates unique constraint customers_email_key"**
A customer with that email already exists. Ask Claude to look them up: "Find the customer with email [email]."

**Claude can't connect to the database**
Make sure the Supabase MCP is connected with your project ID and service role key.

**Schema ran but I don't see the tables**
Refresh the Table Editor. If still missing, check the SQL Editor for error messages.

**I need to start over**
Run this to drop all tables:
```sql
DROP TABLE IF EXISTS activity_log, appointments, jobs, customers, appointment_types, job_stages, lead_sources, app_settings CASCADE;
```
Then re-run the full schema.

---

*Built by Raymond Palmer, Homestead Cabinet Design — homesteadcabinetdesign.com*
*Adapted as an open starter kit for any small service business.*
