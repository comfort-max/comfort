-- Communication templates (email / WhatsApp). Table was missing on some projects; create + RLS here.

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

-- If an older table existed without purpose_label
ALTER TABLE public.communication_templates
  ADD COLUMN IF NOT EXISTS purpose_label text;

COMMENT ON TABLE public.communication_templates IS
  'Email/WhatsApp message templates by purpose and channel. Email row is master; WhatsApp body mirrors email.';

COMMENT ON COLUMN public.communication_templates.purpose IS
  'Slug, e.g. po_vendor, payment_reminder_customer, bill_created_customer, or custom.';

COMMENT ON COLUMN public.communication_templates.purpose_label IS
  'Display name for custom purposes; built-ins use app registry labels.';

COMMENT ON COLUMN public.communication_templates.channel IS 'email or whatsapp';

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
