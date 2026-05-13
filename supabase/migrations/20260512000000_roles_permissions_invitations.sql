-- Safe schema additions for RBAC + invitations (run in Supabase SQL editor if needed).
ALTER TABLE public.app_roles ADD COLUMN IF NOT EXISTS permissions jsonb DEFAULT '{}'::jsonb;

ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS employee_id uuid;
ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS invited_name text;

-- Optional: sync profile role from invite metadata on signup. Only add if you do not already
-- have a conflicting trigger on auth.users. Uncomment after reviewing your auth setup.
/*
CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  meta_role text;
  meta_name text;
BEGIN
  meta_role := COALESCE(NEW.raw_user_meta_data->>'role', 'user');
  meta_name := COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1));

  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (NEW.id, NEW.email, meta_name, meta_role)
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        full_name = COALESCE(EXCLUDED.full_name, profiles.full_name),
        role = COALESCE(NULLIF(EXCLUDED.role, ''), profiles.role);

  UPDATE public.invitations
     SET status = 'accepted'
   WHERE lower(email) = lower(NEW.email)
     AND status = 'pending';

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_profile ON auth.users;
CREATE TRIGGER on_auth_user_created_profile
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user_profile();
*/
