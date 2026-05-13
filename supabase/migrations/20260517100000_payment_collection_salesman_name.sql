-- Legacy singular table: add salesman_name to match payment_collections (app may insert here via fallback).
DO $$
BEGIN
  IF to_regclass('public.payment_collection') IS NOT NULL THEN
    ALTER TABLE public.payment_collection
      ADD COLUMN IF NOT EXISTS salesman_name text;

    UPDATE public.payment_collection pc
    SET salesman_name = COALESCE(
      NULLIF(trim(b.pickup_employee_name), ''),
      NULLIF(trim(b.salesman_name), '')
    )
    FROM public.bills b
    WHERE pc.bill_id = b.id
      AND (pc.salesman_name IS NULL OR trim(pc.salesman_name) = '');

    COMMENT ON COLUMN public.payment_collection.salesman_name IS 'Pickup employee / salesman name copied from bill for reporting';
  END IF;
END $$;
