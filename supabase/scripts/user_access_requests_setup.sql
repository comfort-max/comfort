-- Run in Supabase SQL Editor (see migration 20260522100000_user_access_requests.sql).
-- Enables "Send request to admin" on the access-denied screen.

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'user_access_requests'
ORDER BY ordinal_position;
