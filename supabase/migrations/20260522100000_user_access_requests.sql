-- Pending access requests from users who signed in but lack role permissions.

CREATE TABLE IF NOT EXISTS public.user_access_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  email text NOT NULL DEFAULT '',
  full_name text NOT NULL DEFAULT '',
  current_role text NOT NULL DEFAULT 'user',
  status text NOT NULL DEFAULT 'pending',
  message text,
  last_notified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_access_requests_status_check
    CHECK (status IN ('pending', 'approved', 'dismissed')),
  CONSTRAINT user_access_requests_user_id_key UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS user_access_requests_status_idx
  ON public.user_access_requests (status);

COMMENT ON TABLE public.user_access_requests IS
  'Users without app permissions can request admin review; admins approve via User Management.';

ALTER TABLE public.user_access_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_access_requests_select_own ON public.user_access_requests;
CREATE POLICY user_access_requests_select_own
  ON public.user_access_requests
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS user_access_requests_admin_all ON public.user_access_requests;
CREATE POLICY user_access_requests_admin_all
  ON public.user_access_requests
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND lower(trim(coalesce(p.role, ''))) = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND lower(trim(coalesce(p.role, ''))) = 'admin'
    )
  );

GRANT SELECT, INSERT, UPDATE ON public.user_access_requests TO authenticated;
GRANT ALL ON public.user_access_requests TO service_role;
