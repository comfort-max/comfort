-- Link bill line items to purchase orders and normalize delivery_status for the vendor queue.
-- Idempotent: safe if columns already exist.

ALTER TABLE public.bill_items
  ADD COLUMN IF NOT EXISTS vendor_order_id uuid;

ALTER TABLE public.bill_items
  ADD COLUMN IF NOT EXISTS delivery_status text DEFAULT 'pending';

UPDATE public.bill_items
SET delivery_status = 'pending'
WHERE delivery_status IS NULL OR trim(delivery_status) = '';
