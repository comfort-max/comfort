-- Apply invited role on signup and let invited users claim profile + invitation server-side (bypasses RLS).

CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv_role text;
  inv_name text;
  meta_role text;
  meta_name text;
  final_role text;
  final_name text;
BEGIN
  SELECT i.role, i.invited_name
    INTO inv_role, inv_name
    FROM public.invitations i
   WHERE lower(i.email) = lower(NEW.email)
     AND i.status = 'pending'
   ORDER BY i.id DESC
   LIMIT 1;

  meta_role := NULLIF(trim(COALESCE(NEW.raw_user_meta_data->>'role', '')), '');
  meta_name := NULLIF(trim(COALESCE(NEW.raw_user_meta_data->>'full_name', '')), '');
  final_role := COALESCE(NULLIF(trim(inv_role), ''), meta_role, 'user');
  final_name := COALESCE(NULLIF(trim(inv_name), ''), meta_name, split_part(NEW.email, '@', 1));

  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (NEW.id, NEW.email, final_name, final_role)
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        full_name = COALESCE(NULLIF(EXCLUDED.full_name, ''), profiles.full_name),
        role = CASE
          WHEN profiles.role IS NULL OR trim(profiles.role) = '' OR lower(trim(profiles.role)) = 'user'
          THEN EXCLUDED.role
          ELSE profiles.role
        END;

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

  SELECT i.*
    INTO inv
    FROM public.invitations i
   WHERE lower(i.email) = em
     AND i.status = 'pending'
   ORDER BY i.id DESC
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
        role = CASE
          WHEN profiles.role IS NULL OR trim(profiles.role) = '' OR lower(trim(profiles.role)) = 'user'
          THEN EXCLUDED.role
          ELSE profiles.role
        END;

  IF inv.id IS NOT NULL THEN
    UPDATE public.invitations SET status = 'accepted' WHERE id = inv.id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'role', final_role, 'full_name', final_name);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_invitation_for_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_invitation_for_user() TO authenticated;
