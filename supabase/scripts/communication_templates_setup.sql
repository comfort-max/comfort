-- Run this entire file in Supabase SQL Editor if communication_templates is missing.
-- (Same as migration 20260521100000_communication_templates_purpose_label.sql)

CREATE TABLE IF NOT EXISTS public.communication_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purpose text NOT NULL,
  purpose_label text,
  channel text NOT NULL,
  subject text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  created_date timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT communication_templates_channel_check
    CHECK (channel IN ('email', 'whatsapp')),
  CONSTRAINT communication_templates_status_check
    CHECK (status IN ('active', 'inactive'))
);

ALTER TABLE public.communication_templates
  ADD COLUMN IF NOT EXISTS purpose_label text;

CREATE UNIQUE INDEX IF NOT EXISTS communication_templates_purpose_channel_key
  ON public.communication_templates (purpose, channel);

CREATE INDEX IF NOT EXISTS communication_templates_status_idx
  ON public.communication_templates (status);

ALTER TABLE public.communication_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "communication_templates_authenticated_all" ON public.communication_templates;
CREATE POLICY "communication_templates_authenticated_all"
  ON public.communication_templates
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.communication_templates TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.communication_templates TO service_role;

-- Verify
SELECT
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname = 'communication_templates';

SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'communication_templates'
ORDER BY ordinal_position;

SELECT count(*) AS template_row_count FROM public.communication_templates;
