-- Fix invite flow: keep pending rows visible, defer profile until accept, preserve role.

-- Legacy singular table name → plural (app uses public.invitations).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'invitation'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'invitations'
  ) THEN
    ALTER TABLE public.invitation RENAME TO invitations;
  END IF;
END $$;

-- Create table when missing (fresh Supabase projects may never have had it).
CREATE TABLE IF NOT EXISTS public.invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  role text NOT NULL DEFAULT 'user',
  status text NOT NULL DEFAULT 'pending',
  invited_by text,
  invited_name text,
  employee_id uuid,
  expires_at timestamptz,
  created_date timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS invitations_email_lower_idx
  ON public.invitations (lower(trim(email)));

CREATE INDEX IF NOT EXISTS invitations_status_idx
  ON public.invitations (status);

-- Add any columns missing on older schemas.
ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS role text;
ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS status text DEFAULT 'pending';
ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS invited_by text;
ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS invited_name text;
ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS employee_id uuid;
ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS expires_at timestamptz;
ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS created_date timestamptz DEFAULT now();
ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

-- app_roles (Role Management); create when missing so RLS helper can compile.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'app_role'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'app_roles'
  ) THEN
    ALTER TABLE public.app_role RENAME TO app_roles;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.app_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  permissions jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_date timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.app_roles ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE public.app_roles ADD COLUMN IF NOT EXISTS permissions jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.app_roles ADD COLUMN IF NOT EXISTS created_date timestamptz DEFAULT now();
ALTER TABLE public.app_roles ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

CREATE OR REPLACE FUNCTION public.user_can_view_invitations()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_role text;
  allowed boolean;
BEGIN
  SELECT lower(trim(coalesce(p.role, '')))
    INTO user_role
    FROM public.profiles p
   WHERE p.id = auth.uid();

  IF user_role IS NULL OR user_role = '' THEN
    RETURN false;
  END IF;

  IF user_role = 'admin' THEN
    RETURN true;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'app_roles'
  ) THEN
    RETURN false;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.app_roles ar
    WHERE lower(trim(coalesce(ar.name, ''))) = user_role
      AND (
        coalesce(ar.permissions -> 'admin_invitations' ->> 'view', 'false') = 'true'
        OR coalesce(ar.permissions -> 'admin_invitations' ->> 'edit', 'false') = 'true'
      )
  ) INTO allowed;

  RETURN coalesce(allowed, false);
END;
$$;

ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS invitations_select_admin ON public.invitations;
CREATE POLICY invitations_select_admin ON public.invitations
  FOR SELECT TO authenticated
  USING (public.user_can_view_invitations());

DROP POLICY IF EXISTS invitations_update_admin ON public.invitations;
CREATE POLICY invitations_update_admin ON public.invitations
  FOR UPDATE TO authenticated
  USING (public.user_can_view_invitations())
  WITH CHECK (public.user_can_view_invitations());

DROP POLICY IF EXISTS invitations_delete_admin ON public.invitations;
CREATE POLICY invitations_delete_admin ON public.invitations
  FOR DELETE TO authenticated
  USING (public.user_can_view_invitations());

GRANT SELECT, UPDATE, DELETE ON public.invitations TO authenticated;

-- Pending invite lookup (plural table; singular renamed above if it existed).
CREATE OR REPLACE FUNCTION public.get_pending_invitation_for_email(p_email text)
RETURNS TABLE (id uuid, role text, invited_name text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'invitations') THEN
    RETURN QUERY
    SELECT i.id, i.role, i.invited_name
    FROM public.invitations i
    WHERE lower(trim(i.email)) = lower(trim(p_email))
      AND lower(trim(coalesce(i.status, 'pending'))) = 'pending'
    ORDER BY i.id DESC
    LIMIT 1;
    IF FOUND THEN RETURN; END IF;
  END IF;

END;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv record;
  meta_role text;
  meta_name text;
BEGIN
  SELECT g.id, g.role, g.invited_name
    INTO inv
    FROM public.get_pending_invitation_for_email(NEW.email) g
    LIMIT 1;

  IF inv.id IS NOT NULL THEN
    -- Invited users: auth row exists for the magic link, but no app profile until they accept.
    DELETE FROM public.profiles WHERE id = NEW.id;
    RETURN NEW;
  END IF;

  meta_role := NULLIF(trim(COALESCE(NEW.raw_user_meta_data->>'role', '')), '');
  meta_name := NULLIF(trim(COALESCE(NEW.raw_user_meta_data->>'full_name', '')), '');

  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(meta_name, split_part(NEW.email, '@', 1)),
    COALESCE(meta_role, 'user')
  )
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        full_name = COALESCE(NULLIF(EXCLUDED.full_name, ''), profiles.full_name),
        role = CASE
          WHEN profiles.role IS NULL OR trim(profiles.role) = '' OR lower(trim(profiles.role)) = 'user'
          THEN EXCLUDED.role
          ELSE profiles.role
        END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_profile ON auth.users;
CREATE TRIGGER on_auth_user_created_profile
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user_profile();

CREATE OR REPLACE FUNCTION public.claim_invitation_for_user()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  em text;
  inv record;
  meta_role text;
  meta_name text;
  final_role text;
  final_name text;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  SELECT u.email,
         NULLIF(trim(COALESCE(u.raw_user_meta_data->>'role', '')), ''),
         NULLIF(trim(COALESCE(u.raw_user_meta_data->>'full_name', '')), '')
    INTO em, meta_role, meta_name
    FROM auth.users u
   WHERE u.id = uid;

  em := lower(trim(em));

  SELECT g.id, g.role, g.invited_name
    INTO inv
    FROM public.get_pending_invitation_for_email(em) g
    LIMIT 1;

  final_role := COALESCE(NULLIF(trim(inv.role), ''), meta_role, 'user');
  final_name := COALESCE(
    NULLIF(trim(inv.invited_name), ''),
    meta_name,
    split_part(em, '@', 1)
  );

  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (uid, em, final_name, final_role)
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        full_name = COALESCE(NULLIF(EXCLUDED.full_name, ''), profiles.full_name),
        role = EXCLUDED.role;

  IF inv.id IS NOT NULL THEN
    UPDATE public.invitations SET status = 'accepted' WHERE id = inv.id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'role', final_role, 'full_name', final_name);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_invitation_for_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_invitation_for_user() TO authenticated;

GRANT EXECUTE ON FUNCTION public.user_can_view_invitations() TO authenticated;
