-- Fix "Database error deleting user" when removing accounts from User Management.
-- public.profiles.id references auth.users(id); without ON DELETE CASCADE the auth row cannot be removed.

DO $$
DECLARE
  fk_name text;
BEGIN
  SELECT c.conname INTO fk_name
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname = 'public'
    AND t.relname = 'profiles'
    AND c.contype = 'f'
    AND c.confrelid = 'auth.users'::regclass
  LIMIT 1;

  IF fk_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.profiles DROP CONSTRAINT %I', fk_name);
  END IF;
END $$;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_id_fkey;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_id_fkey
  FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Optional: cascade access-request rows when auth user is removed.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'user_access_requests'
  )
  AND NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'user_access_requests'
      AND constraint_name = 'user_access_requests_user_id_fkey'
  ) THEN
    ALTER TABLE public.user_access_requests
      ADD CONSTRAINT user_access_requests_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'user_access_requests_user_id_fkey not added: %', SQLERRM;
END $$;
