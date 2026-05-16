-- =============================================================================
-- COMFORT — one-off data fixes + salary_records verification
-- Run in Supabase Dashboard → SQL Editor (review SELECTs before UPDATEs).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- A. BILL ITEMS — diagnostics (read-only)
-- -----------------------------------------------------------------------------

-- A1. Lines linked to a PO that no longer exists (stay on Delivery → Vendor Orders without app fix)
SELECT bi.id,
       bi.bill_number,
       bi.item_name,
       bi.vendor_name,
       bi.vendor_order_id,
       bi.delivery_status
FROM public.bill_items bi
WHERE bi.vendor_order_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.vendor_orders vo WHERE vo.id = bi.vendor_order_id
  );

-- A2. Missing or empty delivery_status
SELECT id, bill_number, item_name, vendor_id, vendor_order_id, delivery_status
FROM public.bill_items
WHERE delivery_status IS NULL OR btrim(delivery_status) = '';

-- A3. Assigned + active PO but still "pending" (should be with_vendor for Vendor Orders tab)
SELECT bi.id, bi.bill_number, bi.item_name, bi.delivery_status, bi.vendor_order_id
FROM public.bill_items bi
WHERE bi.vendor_id IS NOT NULL
  AND bi.vendor_order_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM public.vendor_orders vo WHERE vo.id = bi.vendor_order_id)
  AND (bi.delivery_status IS NULL OR bi.delivery_status = 'pending');

-- -----------------------------------------------------------------------------
-- B. BILL ITEMS — fixes (wrap in a transaction if you want to roll back first)
-- -----------------------------------------------------------------------------

BEGIN;

-- B1. Unlink lines from deleted/cancelled POs (removes them from Delivery → Vendor Orders)
UPDATE public.bill_items bi
SET vendor_order_id = NULL
WHERE bi.vendor_order_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.vendor_orders vo WHERE vo.id = bi.vendor_order_id
  );

-- B2. Unassigned lines → pending
UPDATE public.bill_items
SET delivery_status = 'pending'
WHERE (delivery_status IS NULL OR btrim(delivery_status) = '')
  AND vendor_id IS NULL;

-- B3. Assigned, no PO yet → with_vendor
UPDATE public.bill_items
SET delivery_status = 'with_vendor'
WHERE vendor_id IS NOT NULL
  AND vendor_order_id IS NULL
  AND (delivery_status IS NULL OR btrim(delivery_status) = '' OR delivery_status = 'pending');

-- B4. Active PO but wrong status → with_vendor
UPDATE public.bill_items bi
SET delivery_status = 'with_vendor'
WHERE bi.vendor_id IS NOT NULL
  AND bi.vendor_order_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM public.vendor_orders vo WHERE vo.id = bi.vendor_order_id)
  AND (bi.delivery_status IS NULL OR bi.delivery_status = 'pending');

COMMIT;

-- -----------------------------------------------------------------------------
-- C. SALARY_RECORDS — verify table + columns (read-only)
-- -----------------------------------------------------------------------------

-- C1. Which physical table exists (app uses salary_records, fallback salary_record)
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('salary_records', 'salary_record');

-- C2. Columns (compare to app fields below)
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'salary_records'
ORDER BY ordinal_position;

/*
  Expected columns used by src/pages/Salary.jsx (names may vary slightly in DB):
  id, employee_id, employee_name, month, year,
  basic_salary, incentive, bonus, deductions, net_salary,
  payment_status, payment_date, remarks,
  entry_by, entry_timestamp, created_date (or created_at for ordering)
*/

-- C3. Row Level Security enabled?
SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('salary_records', 'salary_record');

-- C4. Policies on salary table(s)
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('salary_records', 'salary_record');

-- C5. Quick row count (as SQL editor / service role)
SELECT count(*) AS salary_row_count FROM public.salary_records;

-- -----------------------------------------------------------------------------
-- D. SALARY_RECORDS — optional RLS (only if C3 shows rls_enabled=true and C4 is empty
--     OR authenticated users get 403 / empty lists in the app Network tab)
-- -----------------------------------------------------------------------------
-- Uncomment after reviewing your security model. This matches a typical
-- "any logged-in user can CRUD" app; tighten if you use role-based DB policies.

/*
ALTER TABLE public.salary_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "salary_records_authenticated_all" ON public.salary_records;
CREATE POLICY "salary_records_authenticated_all"
  ON public.salary_records
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.salary_records TO authenticated;
*/
