-- User Management edit form expects a phone field on profiles.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone text;
