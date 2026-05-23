-- Manual invitation approval + block auto profile creation until accept or admin approve.

DROP FUNCTION IF EXISTS public.claim_invitation_for_user();
DROP FUNCTION IF EXISTS public.claim_invitation_for_user(boolean);

CREATE OR REPLACE FUNCTION public.claim_invitation_for_user(p_accept_invite boolean DEFAULT false)
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
  meta_invite_pending boolean;
  final_role text;
  final_name text;
  existing_role text;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  SELECT lower(trim(coalesce(p.role, '')))
    INTO existing_role
    FROM public.profiles p
   WHERE p.id = uid;

  IF existing_role IS NOT NULL AND existing_role <> '' AND existing_role <> 'user' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'skipped', true,
      'role', existing_role,
      'reason', 'profile_role_preserved'
    );
  END IF;

  SELECT u.email,
         NULLIF(trim(COALESCE(u.raw_user_meta_data->>'role', '')), ''),
         NULLIF(trim(COALESCE(u.raw_user_meta_data->>'full_name', '')), ''),
         COALESCE((u.raw_user_meta_data->>'invite_pending')::boolean, false)
    INTO em, meta_role, meta_name, meta_invite_pending
    FROM auth.users u
   WHERE u.id = uid;

  em := lower(trim(em));

  SELECT g.id, g.role, g.invited_name
    INTO inv
    FROM public.get_pending_invitation_for_email(em) g
    LIMIT 1;

  IF NOT p_accept_invite AND (meta_invite_pending OR inv.id IS NOT NULL) THEN
    RETURN jsonb_build_object(
      'ok', true,
      'skipped', true,
      'reason', 'invitation_not_accepted'
    );
  END IF;

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

REVOKE ALL ON FUNCTION public.claim_invitation_for_user(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_invitation_for_user(boolean) TO authenticated;
