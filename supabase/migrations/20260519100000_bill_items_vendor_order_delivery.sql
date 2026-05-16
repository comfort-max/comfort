-- Link bill line items to purchase orders; normalize delivery_status.
-- Idempotent. Supports singular (bill_item) or plural (bill_items) physical tables.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'bill_item'
  ) THEN
    ALTER TABLE public.bill_item
      ADD COLUMN IF NOT EXISTS vendor_order_id uuid;
    ALTER TABLE public.bill_item
      ADD COLUMN IF NOT EXISTS delivery_status text DEFAULT 'pending';
    UPDATE public.bill_item
    SET delivery_status = 'pending'
    WHERE delivery_status IS NULL OR btrim(delivery_status) = '';
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'bill_items'
  ) THEN
    ALTER TABLE public.bill_items
      ADD COLUMN IF NOT EXISTS vendor_order_id uuid;
    ALTER TABLE public.bill_items
      ADD COLUMN IF NOT EXISTS delivery_status text DEFAULT 'pending';
    UPDATE public.bill_items
    SET delivery_status = 'pending'
    WHERE delivery_status IS NULL OR btrim(delivery_status) = '';
  END IF;
END $$;
