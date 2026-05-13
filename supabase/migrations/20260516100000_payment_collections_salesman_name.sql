-- Denormalized salesman (pickup employee) on payment rows for reports when bill joins are incomplete.
ALTER TABLE public.payment_collections
  ADD COLUMN IF NOT EXISTS salesman_name text;

UPDATE public.payment_collections pc
SET salesman_name = COALESCE(
  NULLIF(trim(b.pickup_employee_name), ''),
  NULLIF(trim(b.salesman_name), '')
)
FROM public.bills b
WHERE pc.bill_id = b.id
  AND (pc.salesman_name IS NULL OR trim(pc.salesman_name) = '');

COMMENT ON COLUMN public.payment_collections.salesman_name IS 'Pickup employee / salesman name copied from bill for reporting';
