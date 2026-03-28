-- Fix missing RLS policies for invoices and payments
-- These tables had RLS enabled in schema.sql but no access policies were created

CREATE POLICY "Allow all access to invoices" ON invoices FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to invoice_line_items" ON invoice_line_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to payments" ON payments FOR ALL USING (true) WITH CHECK (true);
