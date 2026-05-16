-- COMFORT: one-off data fixes + salary verification (Supabase SQL Editor)
-- Your project uses singular tables: bill_item, vendor_order (not bill_items).
-- Run each numbered block separately (select the block, then Run). Do not paste lines that are only "====".

-- BLOCK 0: discover table names (run first)
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'bill_item', 'bill_items',
    'vendor_order', 'vendor_orders',
    'salary_record', 'salary_records'
  )
ORDER BY table_name;


-- BLOCK A1: lines linked to a deleted PO (read-only)
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


-- BLOCK A2: missing delivery_status (read-only)
SELECT id, bill_number, item_name, vendor_id, vendor_order_id, delivery_status
FROM public.bill_item
WHERE delivery_status IS NULL OR btrim(delivery_status) = '';


-- BLOCK A3: active PO but status still pending (read-only)
SELECT bi.id, bi.bill_number, bi.item_name, bi.delivery_status, bi.vendor_order_id
FROM public.bill_item bi
WHERE bi.vendor_id IS NOT NULL
  AND bi.vendor_order_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM public.vendor_order vo WHERE vo.id = bi.vendor_order_id)
  AND (bi.delivery_status IS NULL OR bi.delivery_status = 'pending');


-- BLOCK B: apply fixes (run A1-A3 first; then run this whole block)
BEGIN;

UPDATE public.bill_item bi
SET vendor_order_id = NULL
WHERE bi.vendor_order_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.vendor_order vo WHERE vo.id = bi.vendor_order_id
  );

UPDATE public.bill_item
SET delivery_status = 'pending'
WHERE (delivery_status IS NULL OR btrim(delivery_status) = '')
  AND vendor_id IS NULL;

UPDATE public.bill_item
SET delivery_status = 'with_vendor'
WHERE vendor_id IS NOT NULL
  AND vendor_order_id IS NULL
  AND (delivery_status IS NULL OR btrim(delivery_status) = '' OR delivery_status = 'pending');

UPDATE public.bill_item bi
SET delivery_status = 'with_vendor'
WHERE bi.vendor_id IS NOT NULL
  AND bi.vendor_order_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM public.vendor_order vo WHERE vo.id = bi.vendor_order_id)
  AND (bi.delivery_status IS NULL OR bi.delivery_status = 'pending');

COMMIT;


-- BLOCK C1: which salary table exists
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('salary_records', 'salary_record');


-- BLOCK C2: salary_record columns (if C1 shows salary_record)
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'salary_record'
ORDER BY ordinal_position;


-- BLOCK C3: RLS enabled on salary tables
SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('salary_records', 'salary_record');


-- BLOCK C4: RLS policies on salary tables
SELECT schemaname, tablename, policyname, permissive, roles, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('salary_records', 'salary_record');


-- BLOCK C5: row count (use table name from C1; change salary_record if yours is salary_records)
SELECT count(*) AS salary_row_count FROM public.salary_record;
