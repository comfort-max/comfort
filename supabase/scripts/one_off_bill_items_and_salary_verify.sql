-- =============================================================================
-- COMFORT — one-off data fixes + salary_records verification
-- Run in Supabase Dashboard → SQL Editor (review SELECTs before UPDATEs).
--
-- This project may use SINGULAR table names (bill_item, vendor_order) or PLURAL
-- (bill_items, vendor_orders). Section 0 detects yours; sections A–B use bill_item.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. DISCOVER table names in your database (run this first)
-- -----------------------------------------------------------------------------
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'bill_item', 'bill_items',
    'vendor_order', 'vendor_orders',
    'salary_record', 'salary_records'
  )
ORDER BY table_name;

-- If the list shows bill_items (plural), replace bill_item → bill_items below.
-- If it shows vendor_orders (plural), replace vendor_order → vendor_orders below.

-- -----------------------------------------------------------------------------
-- A. BILL LINE ITEMS — diagnostics (read-only)  [table: bill_item]
-- -----------------------------------------------------------------------------

-- A1. Lines linked to a PO that no longer exists
SELECT bi.id,
       bi.bill_number,
       bi.item_name,
       bi.vendor_name,
       bi.vendor_order_id,
       bi.delivery_status
FROM public.bill_item bi
WHERE bi.vendor_order_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.vendor_order vo WHERE vo.id = bi.vendor_order_id
  );

-- A2. Missing or empty delivery_status
SELECT id, bill_number, item_name, vendor_id, vendor_order_id, delivery_status
FROM public.bill_item
WHERE delivery_status IS NULL OR btrim(delivery_status) = '';

-- A3. Assigned + active PO but still "pending" (should be with_vendor)
SELECT bi.id, bi.bill_number, bi.item_name, bi.delivery_status, bi.vendor_order_id
FROM public.bill_item bi
WHERE bi.vendor_id IS NOT NULL
  AND bi.vendor_order_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM public.vendor_order vo WHERE vo.id = bi.vendor_order_id)
  AND (bi.delivery_status IS NULL OR bi.delivery_status = 'pending');

-- -----------------------------------------------------------------------------
-- B. BILL LINE ITEMS — fixes
-- -----------------------------------------------------------------------------

BEGIN;

-- B1. Unlink lines from deleted/cancelled POs (removes them from Delivery → Vendor Orders)
UPDATE public.bill_item bi
SET vendor_order_id = NULL
WHERE bi.vendor_order_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.vendor_order vo WHERE vo.id = bi.vendor_order_id
  );

-- B2. Unassigned lines → pending
UPDATE public.bill_item
SET delivery_status = 'pending'
WHERE (delivery_status IS NULL OR btrim(delivery_status) = '')
  AND vendor_id IS NULL;

-- B3. Assigned, no PO yet → with_vendor
UPDATE public.bill_item
SET delivery_status = 'with_vendor'
WHERE vendor_id IS NOT NULL
  AND vendor_order_id IS NULL
  AND (delivery_status IS NULL OR btrim(delivery_status) = '' OR delivery_status = 'pending');

-- B4. Active PO but wrong status → with_vendor
UPDATE public.bill_item bi
SET delivery_status = 'with_vendor'
WHERE bi.vendor_id IS NOT NULL
  AND bi.vendor_order_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM public.vendor_order vo WHERE vo.id = bi.vendor_order_id)
  AND (bi.delivery_status IS NULL OR bi.delivery_status = 'pending');

COMMIT;

-- -----------------------------------------------------------------------------
-- C. SALARY — verify table + columns (read-only)
-- -----------------------------------------------------------------------------

-- C1. Which physical table exists
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('salary_records', 'salary_record');

-- C2. Columns — run for whichever table C1 returned (example: salary_record)
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'salary_record'
ORDER BY ordinal_position;

/*
  Expected columns used by src/pages/Salary.jsx:
  id, employee_id, employee_name, month, year,
  basic_salary, incentive, bonus, deductions, net_salary,
  payment_status, payment_date, remarks,
  entry_by, entry_timestamp, created_date (or created_at)
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

-- C5. Row count — use the table name from C1
SELECT count(*) AS salary_row_count FROM public.salary_record;

-- -----------------------------------------------------------------------------
-- D. SALARY — optional RLS (uncomment; use salary_record or salary_records from C1)
-- -----------------------------------------------------------------------------

/*
ALTER TABLE public.salary_record ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "salary_record_authenticated_all" ON public.salary_record;
CREATE POLICY "salary_record_authenticated_all"
  ON public.salary_record
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.salary_record TO authenticated;
*/
