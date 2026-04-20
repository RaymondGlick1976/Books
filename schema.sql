-- HCD Books Database Schema
-- Exported from Supabase (project: byozvlgtbwiohyrfvxii)
-- Date: 2026-04-19

-- Table: activity_log
CREATE TABLE public.activity_log (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  customer_id uuid,
  activity_type character varying NOT NULL,
  reference_type character varying,
  reference_id uuid,
  description text,
  ip_address character varying,
  created_at timestamp with time zone DEFAULT now()
);

-- Table: app_roles
CREATE TABLE public.app_roles (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  name character varying NOT NULL,
  description text,
  can_access_settings boolean DEFAULT false,
  can_view_financials boolean DEFAULT false,
  can_delete boolean DEFAULT false,
  can_manage_users boolean DEFAULT false,
  can_send_invoices boolean DEFAULT false,
  can_edit_quotes boolean DEFAULT true,
  can_edit_customers boolean DEFAULT true,
  can_edit_pipeline boolean DEFAULT true,
  is_system boolean DEFAULT false,
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  can_view_quotes boolean DEFAULT true,
  can_view_invoices boolean DEFAULT true,
  can_view_customers boolean DEFAULT true,
  can_view_pipeline boolean DEFAULT true
);

-- Table: app_settings
CREATE TABLE public.app_settings (
  key text NOT NULL,
  value jsonb NOT NULL,
  updated_at timestamp with time zone DEFAULT now()
);

-- Table: app_users
CREATE TABLE public.app_users (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  name character varying NOT NULL,
  pin character varying NOT NULL,
  role_id uuid,
  is_active boolean DEFAULT true,
  last_login timestamp with time zone,
  created_at timestamp with time zone DEFAULT now()
);

-- Table: appointment_types
CREATE TABLE public.appointment_types (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  name character varying NOT NULL,
  color character varying DEFAULT '#6366f1'::character varying,
  icon character varying DEFAULT '📅'::character varying,
  sort_order integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now()
);

-- Table: appointments
CREATE TABLE public.appointments (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  appointment_type_id uuid,
  customer_id uuid,
  deal_id uuid,
  title character varying NOT NULL,
  appointment_date date NOT NULL,
  appointment_time time without time zone,
  duration_minutes integer DEFAULT 60,
  location text,
  notes text,
  status character varying DEFAULT 'scheduled'::character varying,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  gcal_event_id text,
  reminder_sent_at timestamp with time zone,
  confirmation_email_sent_at timestamp with time zone
);

-- Table: assemblies
CREATE TABLE public.assemblies (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  library_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  is_active boolean DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now()
);

-- Table: assembly_items
CREATE TABLE public.assembly_items (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  assembly_id uuid NOT NULL,
  catalog_item_id uuid NOT NULL,
  quantity numeric DEFAULT 1,
  sort_order integer DEFAULT 0
);

-- Table: auth_tokens
CREATE TABLE public.auth_tokens (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  customer_id uuid,
  token uuid NOT NULL DEFAULT uuid_generate_v4(),
  token_type character varying NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  expires_at timestamp with time zone NOT NULL,
  used_at timestamp with time zone,
  ip_address character varying,
  user_agent text
);

-- Table: booking_form_questions
CREATE TABLE public.booking_form_questions (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  form_id uuid,
  prompt character varying NOT NULL,
  field_type character varying DEFAULT 'text'::character varying,
  choices jsonb,
  is_required boolean DEFAULT false,
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now()
);

-- Table: booking_forms
CREATE TABLE public.booking_forms (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  name character varying NOT NULL,
  slug character varying NOT NULL,
  header_title character varying DEFAULT 'Request an Appointment'::character varying,
  header_description text,
  show_address boolean DEFAULT true,
  show_service_details boolean DEFAULT true,
  show_how_heard boolean DEFAULT true,
  show_date_time boolean DEFAULT false,
  allow_attachments boolean DEFAULT true,
  attachments_required boolean DEFAULT false,
  show_sms_consent boolean DEFAULT true,
  primary_color character varying DEFAULT '#6366f1'::character varying,
  how_heard_options jsonb DEFAULT '["Google Search", "Facebook", "Referral", "Repeat Customer", "Other"]'::jsonb,
  thank_you_title character varying DEFAULT 'Thank You!'::character varying,
  thank_you_message text DEFAULT 'We have received your request and will be in touch shortly.'::text,
  default_stage character varying DEFAULT 'new-lead'::character varying,
  is_active boolean DEFAULT true,
  submission_count integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  show_scheduler boolean DEFAULT false,
  thank_you_redirect_url text,
  attachments_label character varying DEFAULT 'Please add a few photos of your project'::character varying
);

-- Table: booking_submissions
CREATE TABLE public.booking_submissions (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  form_id uuid,
  customer_id uuid,
  deal_id uuid,
  first_name character varying NOT NULL,
  last_name character varying NOT NULL,
  email character varying NOT NULL,
  phone character varying,
  address text,
  city character varying,
  state character varying,
  zip character varying,
  service_details text,
  how_heard character varying,
  preferred_date date,
  preferred_time time without time zone,
  sms_consent boolean DEFAULT false,
  custom_answers jsonb,
  attachments jsonb,
  status character varying DEFAULT 'new'::character varying,
  notes text,
  created_at timestamp with time zone DEFAULT now()
);

-- Table: catalog_item_attributes
CREATE TABLE public.catalog_item_attributes (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  item_id uuid,
  attribute_id uuid,
  is_required boolean DEFAULT true,
  sort_order integer DEFAULT 0,
  pricing_type text NOT NULL DEFAULT 'each'::text
);

-- Table: change_order_items
CREATE TABLE public.change_order_items (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  change_order_id uuid,
  description text NOT NULL,
  quantity numeric DEFAULT 1,
  unit_price numeric DEFAULT 0,
  total numeric DEFAULT 0,
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now()
);

-- Table: change_orders
CREATE TABLE public.change_orders (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  quote_id uuid,
  change_order_number character varying NOT NULL,
  title character varying,
  status character varying DEFAULT 'draft'::character varying,
  subtotal numeric DEFAULT 0,
  tax numeric DEFAULT 0,
  total numeric DEFAULT 0,
  notes text,
  sent_at timestamp with time zone,
  viewed_at timestamp with time zone,
  accepted_at timestamp with time zone,
  declined_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Table: customer_uploads
CREATE TABLE public.customer_uploads (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  customer_id uuid,
  quote_id uuid,
  file_url text NOT NULL,
  file_name character varying NOT NULL,
  file_type character varying,
  file_size integer,
  caption text,
  uploaded_at timestamp with time zone DEFAULT now(),
  job_id uuid
);

-- Table: customers
CREATE TABLE public.customers (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  name character varying NOT NULL,
  email character varying NOT NULL,
  phone character varying,
  address text,
  city character varying,
  state character varying,
  zip character varying,
  notes text,
  portal_token uuid DEFAULT uuid_generate_v4(),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  last_login_at timestamp with time zone,
  lead_source character varying,
  company character varying,
  first_name character varying,
  last_name character varying,
  lead_source_id uuid,
  assigned_to uuid,
  disable_drips boolean DEFAULT false,
  qb_customer_id character varying
);

-- Table: door_orders
CREATE TABLE public.door_orders (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  job_name text NOT NULL,
  company text,
  order_data jsonb NOT NULL
);

-- Table: email_logs
CREATE TABLE public.email_logs (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  template_id uuid,
  customer_id uuid,
  deal_id uuid,
  appointment_id uuid,
  to_email character varying NOT NULL,
  subject character varying NOT NULL,
  body text NOT NULL,
  sent_at timestamp with time zone DEFAULT now(),
  sent_by uuid
);

-- Table: email_templates
CREATE TABLE public.email_templates (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  name character varying NOT NULL,
  subject character varying NOT NULL,
  body text NOT NULL,
  template_type character varying NOT NULL,
  stage_id character varying,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Table: google_calendar_connection
CREATE TABLE public.google_calendar_connection (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  calendar_id text,
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  token_expires_at timestamp with time zone NOT NULL,
  connected_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Table: invoice_line_items
CREATE TABLE public.invoice_line_items (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  invoice_id uuid,
  description text NOT NULL,
  details text,
  quantity numeric DEFAULT 1,
  unit character varying DEFAULT 'each'::character varying,
  unit_price numeric NOT NULL,
  line_total numeric NOT NULL,
  is_taxable boolean DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  attribute_selections jsonb DEFAULT '[]'::jsonb
);

-- Table: invoices
CREATE TABLE public.invoices (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  invoice_number character varying NOT NULL,
  quote_id uuid,
  customer_id uuid,
  title character varying NOT NULL,
  status character varying DEFAULT 'draft'::character varying,
  subtotal numeric DEFAULT 0,
  tax_rate numeric DEFAULT 0,
  tax_amount numeric DEFAULT 0,
  total numeric DEFAULT 0,
  amount_paid numeric DEFAULT 0,
  amount_due numeric DEFAULT 0,
  notes text,
  internal_notes text,
  due_date date,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  sent_at timestamp with time zone,
  paid_at timestamp with time zone,
  qb_invoice_id character varying,
  qb_synced_at timestamp with time zone,
  access_token character varying
);

-- Table: items_catalog
CREATE TABLE public.items_catalog (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  name character varying NOT NULL,
  description text,
  category character varying,
  default_price numeric,
  price_range_low numeric,
  price_range_high numeric,
  photo_url text,
  is_active boolean DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  is_taxable boolean DEFAULT true,
  library_id uuid,
  folder_id uuid,
  item_number character varying,
  notes text,
  vendor_id uuid,
  product_sku character varying,
  cost_price numeric,
  selling_price numeric
);

-- Table: job_event_types
CREATE TABLE public.job_event_types (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  name character varying NOT NULL,
  color character varying DEFAULT '#6366f1'::character varying,
  icon character varying DEFAULT '📅'::character varying,
  sort_order integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now()
);

-- Table: job_events
CREATE TABLE public.job_events (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  job_id uuid,
  event_type_id uuid,
  event_date date NOT NULL,
  notes text,
  is_completed boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  event_end_date date,
  event_name text,
  event_color character varying
);

-- Table: job_photos
CREATE TABLE public.job_photos (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  job_id uuid,
  name character varying,
  file_url text,
  file_data text,
  photo_type character varying DEFAULT 'progress'::character varying,
  notes text,
  created_at timestamp with time zone DEFAULT now()
);

-- Table: job_pipeline_summary
CREATE TABLE public.job_pipeline_summary (
  stage_id character varying,
  label character varying,
  color character varying,
  sort_order integer,
  job_count bigint,
  total_value numeric
);

-- Table: job_stages
CREATE TABLE public.job_stages (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  stage_id character varying NOT NULL,
  label character varying NOT NULL,
  color character varying DEFAULT '#6366f1'::character varying,
  sort_order integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now()
);

-- Table: jobs
CREATE TABLE public.jobs (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  job_number character varying,
  name character varying NOT NULL,
  customer_id uuid,
  quote_id uuid,
  invoice_id uuid,
  stage character varying DEFAULT 'quotes'::character varying,
  shop_date date,
  installation_date date,
  completed_date date,
  job_items jsonb DEFAULT '[]'::jsonb,
  colors jsonb DEFAULT '[]'::jsonb,
  refacing_materials text,
  estimated_value numeric,
  actual_value numeric,
  notes text,
  internal_notes text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  assigned_to uuid,
  project_manager_id uuid,
  job_street character varying,
  job_city character varying,
  job_state character varying,
  job_zip character varying,
  job_finishes jsonb DEFAULT '[]'::jsonb
);

-- Table: jobs_with_details
CREATE TABLE public.jobs_with_details (
  id uuid,
  job_number character varying,
  name character varying,
  customer_id uuid,
  quote_id uuid,
  invoice_id uuid,
  stage character varying,
  shop_date date,
  installation_date date,
  completed_date date,
  job_items jsonb,
  colors jsonb,
  refacing_materials text,
  estimated_value numeric,
  actual_value numeric,
  notes text,
  internal_notes text,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  assigned_to uuid,
  project_manager_id uuid,
  job_street character varying,
  job_city character varying,
  job_state character varying,
  job_zip character varying,
  customer_name character varying,
  customer_first_name character varying,
  customer_last_name character varying,
  customer_email character varying,
  customer_phone character varying,
  customer_address text,
  customer_city character varying,
  customer_state character varying,
  customer_zip character varying,
  quote_number character varying,
  quote_total numeric,
  stage_label character varying,
  stage_color character varying,
  assigned_to_name character varying,
  project_manager_name character varying
);

-- Table: lead_sources
CREATE TABLE public.lead_sources (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  name character varying NOT NULL,
  is_active boolean DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now()
);

-- Table: libraries
CREATE TABLE public.libraries (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  is_default boolean DEFAULT false,
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now()
);

-- Table: library_folders
CREATE TABLE public.library_folders (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  library_id uuid NOT NULL,
  parent_id uuid,
  name text NOT NULL,
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now()
);

-- Table: notification_queue
CREATE TABLE public.notification_queue (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  customer_id uuid,
  notification_type character varying NOT NULL,
  reference_type character varying,
  reference_id uuid,
  scheduled_for timestamp with time zone DEFAULT now(),
  is_admin_notification boolean DEFAULT false,
  sent_at timestamp with time zone,
  error_message text,
  created_at timestamp with time zone DEFAULT now()
);

-- Table: notifications
CREATE TABLE public.notifications (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  customer_id uuid,
  notification_type character varying NOT NULL,
  reference_type character varying,
  reference_id uuid,
  subject character varying,
  body_html text,
  sent_at timestamp with time zone,
  opened_at timestamp with time zone,
  clicked_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now()
);

-- Table: payment_allocations
CREATE TABLE public.payment_allocations (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  payment_id uuid NOT NULL,
  invoice_id uuid NOT NULL,
  amount numeric NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

-- Table: payment_schedule_template_items
CREATE TABLE public.payment_schedule_template_items (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  template_id uuid,
  name text NOT NULL,
  due_description text,
  amount_type text NOT NULL,
  amount_value numeric NOT NULL,
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now()
);

-- Table: payment_schedule_templates
CREATE TABLE public.payment_schedule_templates (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  description text,
  is_default boolean DEFAULT false,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Table: payments
CREATE TABLE public.payments (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  invoice_id uuid,
  customer_id uuid,
  amount numeric NOT NULL,
  payment_type character varying DEFAULT 'card'::character varying,
  payment_method character varying,
  stripe_payment_intent_id character varying,
  stripe_charge_id character varying,
  status character varying DEFAULT 'pending'::character varying,
  notes text,
  payment_date timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now(),
  reference_number character varying,
  qb_payment_id character varying,
  qb_synced_at timestamp with time zone
);

-- Table: pricing_attribute_options
CREATE TABLE public.pricing_attribute_options (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  attribute_id uuid,
  name text NOT NULL,
  flat_adjustment numeric DEFAULT 0,
  multiplier numeric DEFAULT 1,
  is_default boolean DEFAULT false,
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  pricing_type text DEFAULT 'each'::text,
  unit_price numeric DEFAULT 0
);

-- Table: pricing_attributes
CREATE TABLE public.pricing_attributes (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  description text,
  is_active boolean DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  is_public boolean DEFAULT false
);

-- Table: pricing_types
CREATE TABLE public.pricing_types (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  code character varying NOT NULL,
  name character varying NOT NULL,
  label character varying NOT NULL,
  is_builtin boolean DEFAULT false,
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now()
);

-- Table: punch_list_items
CREATE TABLE public.punch_list_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL,
  description text NOT NULL,
  is_completed boolean DEFAULT false,
  completed_at timestamp with time zone,
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now()
);

-- Table: quickbooks_connection
CREATE TABLE public.quickbooks_connection (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  realm_id character varying NOT NULL,
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  token_expires_at timestamp with time zone NOT NULL,
  connected_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Table: quote_attachments
CREATE TABLE public.quote_attachments (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  quote_id uuid,
  file_url text NOT NULL,
  file_name character varying NOT NULL,
  file_type character varying,
  file_size integer,
  display_order integer DEFAULT 0,
  uploaded_at timestamp with time zone DEFAULT now()
);

-- Table: quote_line_items
CREATE TABLE public.quote_line_items (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  quote_id uuid,
  catalog_item_id uuid,
  description text NOT NULL,
  details text,
  quantity numeric DEFAULT 1,
  unit character varying DEFAULT 'each'::character varying,
  unit_price numeric,
  price_range_low numeric,
  price_range_high numeric,
  is_range_pricing boolean DEFAULT false,
  line_total numeric,
  line_total_low numeric,
  line_total_high numeric,
  photo_url text,
  is_optional boolean DEFAULT false,
  is_selected boolean DEFAULT false,
  is_taxable boolean DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  attribute_selections jsonb DEFAULT '[]'::jsonb,
  base_price numeric
);

-- Table: quote_package_items
CREATE TABLE public.quote_package_items (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  package_id uuid NOT NULL,
  name character varying NOT NULL,
  description text,
  quantity numeric DEFAULT 1,
  price numeric DEFAULT 0,
  is_included boolean DEFAULT true,
  show_price boolean DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  base_price numeric DEFAULT 0,
  attribute_selections jsonb DEFAULT '[]'::jsonb
);

-- Table: quote_packages
CREATE TABLE public.quote_packages (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  quote_id uuid NOT NULL,
  name character varying NOT NULL,
  description text,
  price numeric,
  is_recommended boolean DEFAULT false,
  is_selected boolean DEFAULT false,
  apply_tax boolean DEFAULT false,
  tax_rate numeric DEFAULT 0,
  hide_non_included boolean DEFAULT false,
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Table: quotes
CREATE TABLE public.quotes (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  quote_number character varying NOT NULL,
  customer_id uuid,
  title character varying NOT NULL,
  description text,
  status character varying DEFAULT 'draft'::character varying,
  quote_type character varying DEFAULT 'final'::character varying,
  subtotal numeric DEFAULT 0,
  subtotal_low numeric,
  subtotal_high numeric,
  tax_rate numeric DEFAULT 0,
  tax_amount numeric DEFAULT 0,
  total numeric DEFAULT 0,
  total_low numeric,
  total_high numeric,
  deposit_type character varying DEFAULT 'percentage'::character varying,
  deposit_value numeric DEFAULT 50,
  deposit_amount numeric,
  video_url text,
  notes text,
  internal_notes text,
  valid_days integer DEFAULT 30,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  sent_at timestamp with time zone,
  viewed_at timestamp with time zone,
  accepted_at timestamp with time zone,
  expires_at timestamp with time zone,
  access_token character varying,
  packages_enabled boolean DEFAULT false,
  selected_package_id uuid,
  slider_settings jsonb,
  payment_method character varying,
  payment_schedule jsonb,
  terms_and_conditions text,
  qb_estimate_id character varying,
  qb_synced_at timestamp with time zone
);

-- Table: settings
CREATE TABLE public.settings (
  key character varying NOT NULL,
  value jsonb NOT NULL,
  updated_at timestamp with time zone DEFAULT now()
);

-- Table: vendors
CREATE TABLE public.vendors (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  name character varying NOT NULL,
  contact_name character varying,
  phone character varying,
  email character varying,
  address text,
  city character varying,
  state character varying,
  zip character varying,
  website text,
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);



-- ==========================================
-- CONSTRAINTS
-- ==========================================

-- Unique Constraints
ALTER TABLE public.app_roles ADD UNIQUE (name);
ALTER TABLE public.auth_tokens ADD UNIQUE (token);
ALTER TABLE public.booking_forms ADD UNIQUE (slug);
ALTER TABLE public.customers ADD UNIQUE (email);
ALTER TABLE public.invoices ADD UNIQUE (access_token);
ALTER TABLE public.invoices ADD UNIQUE (invoice_number);
ALTER TABLE public.job_stages ADD UNIQUE (stage_id);
ALTER TABLE public.jobs ADD UNIQUE (job_number);
ALTER TABLE public.lead_sources ADD UNIQUE (name);
ALTER TABLE public.pricing_types ADD UNIQUE (code);
ALTER TABLE public.quotes ADD UNIQUE (access_token);
ALTER TABLE public.quotes ADD UNIQUE (quote_number);
ALTER TABLE public.assembly_items ADD UNIQUE (assembly_id, catalog_item_id);
ALTER TABLE public.catalog_item_attributes ADD UNIQUE (item_id, attribute_id);

-- Foreign Keys
ALTER TABLE public.activity_log ADD CONSTRAINT activity_log_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id);
ALTER TABLE public.app_users ADD CONSTRAINT app_users_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.app_roles(id);
ALTER TABLE public.appointments ADD CONSTRAINT appointments_appointment_type_id_fkey FOREIGN KEY (appointment_type_id) REFERENCES public.appointment_types(id);
ALTER TABLE public.appointments ADD CONSTRAINT appointments_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id);
ALTER TABLE public.appointments ADD CONSTRAINT appointments_deal_id_fkey FOREIGN KEY (deal_id) REFERENCES public.jobs(id);
ALTER TABLE public.assemblies ADD CONSTRAINT assemblies_library_id_fkey FOREIGN KEY (library_id) REFERENCES public.libraries(id);
ALTER TABLE public.assembly_items ADD CONSTRAINT assembly_items_assembly_id_fkey FOREIGN KEY (assembly_id) REFERENCES public.assemblies(id);
ALTER TABLE public.assembly_items ADD CONSTRAINT assembly_items_catalog_item_id_fkey FOREIGN KEY (catalog_item_id) REFERENCES public.items_catalog(id);
ALTER TABLE public.auth_tokens ADD CONSTRAINT auth_tokens_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id);
ALTER TABLE public.booking_form_questions ADD CONSTRAINT booking_form_questions_form_id_fkey FOREIGN KEY (form_id) REFERENCES public.booking_forms(id);
ALTER TABLE public.booking_submissions ADD CONSTRAINT booking_submissions_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id);
ALTER TABLE public.booking_submissions ADD CONSTRAINT booking_submissions_deal_id_fkey FOREIGN KEY (deal_id) REFERENCES public.jobs(id);
ALTER TABLE public.booking_submissions ADD CONSTRAINT booking_submissions_form_id_fkey FOREIGN KEY (form_id) REFERENCES public.booking_forms(id);
ALTER TABLE public.catalog_item_attributes ADD CONSTRAINT catalog_item_attributes_attribute_id_fkey FOREIGN KEY (attribute_id) REFERENCES public.pricing_attributes(id);
ALTER TABLE public.catalog_item_attributes ADD CONSTRAINT catalog_item_attributes_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.items_catalog(id);
ALTER TABLE public.change_order_items ADD CONSTRAINT change_order_items_change_order_id_fkey FOREIGN KEY (change_order_id) REFERENCES public.change_orders(id);
ALTER TABLE public.change_orders ADD CONSTRAINT change_orders_quote_id_fkey FOREIGN KEY (quote_id) REFERENCES public.quotes(id);
ALTER TABLE public.customer_uploads ADD CONSTRAINT customer_uploads_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id);
ALTER TABLE public.customer_uploads ADD CONSTRAINT customer_uploads_quote_id_fkey FOREIGN KEY (quote_id) REFERENCES public.quotes(id);
ALTER TABLE public.customers ADD CONSTRAINT customers_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES public.app_users(id);
ALTER TABLE public.customers ADD CONSTRAINT customers_lead_source_id_fkey FOREIGN KEY (lead_source_id) REFERENCES public.lead_sources(id);
ALTER TABLE public.email_logs ADD CONSTRAINT email_logs_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES public.appointments(id);
ALTER TABLE public.email_logs ADD CONSTRAINT email_logs_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id);
ALTER TABLE public.email_logs ADD CONSTRAINT email_logs_deal_id_fkey FOREIGN KEY (deal_id) REFERENCES public.jobs(id);
ALTER TABLE public.email_logs ADD CONSTRAINT email_logs_sent_by_fkey FOREIGN KEY (sent_by) REFERENCES public.app_users(id);
ALTER TABLE public.email_logs ADD CONSTRAINT email_logs_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.email_templates(id);
ALTER TABLE public.email_templates ADD CONSTRAINT email_templates_stage_id_fkey FOREIGN KEY (stage_id) REFERENCES public.job_stages(stage_id);
ALTER TABLE public.invoice_line_items ADD CONSTRAINT invoice_line_items_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices(id);
ALTER TABLE public.invoices ADD CONSTRAINT invoices_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id);
ALTER TABLE public.invoices ADD CONSTRAINT invoices_quote_id_fkey FOREIGN KEY (quote_id) REFERENCES public.quotes(id);
ALTER TABLE public.items_catalog ADD CONSTRAINT items_catalog_folder_id_fkey FOREIGN KEY (folder_id) REFERENCES public.library_folders(id);
ALTER TABLE public.items_catalog ADD CONSTRAINT items_catalog_library_id_fkey FOREIGN KEY (library_id) REFERENCES public.libraries(id);
ALTER TABLE public.items_catalog ADD CONSTRAINT items_catalog_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES public.vendors(id);
ALTER TABLE public.job_events ADD CONSTRAINT job_events_event_type_id_fkey FOREIGN KEY (event_type_id) REFERENCES public.job_event_types(id);
ALTER TABLE public.job_events ADD CONSTRAINT job_events_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.jobs(id);
ALTER TABLE public.job_photos ADD CONSTRAINT job_photos_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.jobs(id);
ALTER TABLE public.jobs ADD CONSTRAINT jobs_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES public.app_users(id);
ALTER TABLE public.jobs ADD CONSTRAINT jobs_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id);
ALTER TABLE public.jobs ADD CONSTRAINT jobs_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices(id);
ALTER TABLE public.jobs ADD CONSTRAINT jobs_project_manager_id_fkey FOREIGN KEY (project_manager_id) REFERENCES public.app_users(id);
ALTER TABLE public.jobs ADD CONSTRAINT jobs_quote_id_fkey FOREIGN KEY (quote_id) REFERENCES public.quotes(id);
ALTER TABLE public.jobs ADD CONSTRAINT jobs_stage_fkey FOREIGN KEY (stage) REFERENCES public.job_stages(stage_id);
ALTER TABLE public.library_folders ADD CONSTRAINT library_folders_library_id_fkey FOREIGN KEY (library_id) REFERENCES public.libraries(id);
ALTER TABLE public.library_folders ADD CONSTRAINT library_folders_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.library_folders(id);
ALTER TABLE public.notification_queue ADD CONSTRAINT notification_queue_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id);
ALTER TABLE public.notifications ADD CONSTRAINT notifications_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id);
ALTER TABLE public.payment_allocations ADD CONSTRAINT payment_allocations_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices(id);
ALTER TABLE public.payment_allocations ADD CONSTRAINT payment_allocations_payment_id_fkey FOREIGN KEY (payment_id) REFERENCES public.payments(id);
ALTER TABLE public.payment_schedule_template_items ADD CONSTRAINT payment_schedule_template_items_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.payment_schedule_templates(id);
ALTER TABLE public.payments ADD CONSTRAINT payments_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id);
ALTER TABLE public.payments ADD CONSTRAINT payments_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices(id);
ALTER TABLE public.pricing_attribute_options ADD CONSTRAINT pricing_attribute_options_attribute_id_fkey FOREIGN KEY (attribute_id) REFERENCES public.pricing_attributes(id);
ALTER TABLE public.punch_list_items ADD CONSTRAINT punch_list_items_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.jobs(id);
ALTER TABLE public.quote_attachments ADD CONSTRAINT quote_attachments_quote_id_fkey FOREIGN KEY (quote_id) REFERENCES public.quotes(id);
ALTER TABLE public.quote_line_items ADD CONSTRAINT quote_line_items_catalog_item_id_fkey FOREIGN KEY (catalog_item_id) REFERENCES public.items_catalog(id);
ALTER TABLE public.quote_line_items ADD CONSTRAINT quote_line_items_quote_id_fkey FOREIGN KEY (quote_id) REFERENCES public.quotes(id);
ALTER TABLE public.quote_package_items ADD CONSTRAINT quote_package_items_package_id_fkey FOREIGN KEY (package_id) REFERENCES public.quote_packages(id);
ALTER TABLE public.quote_packages ADD CONSTRAINT quote_packages_quote_id_fkey FOREIGN KEY (quote_id) REFERENCES public.quotes(id);
ALTER TABLE public.quotes ADD CONSTRAINT quotes_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id);
ALTER TABLE public.quotes ADD CONSTRAINT quotes_selected_package_id_fkey FOREIGN KEY (selected_package_id) REFERENCES public.quote_packages(id);
