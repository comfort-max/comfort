-- Run in Supabase SQL Editor after 20260520100000_comfort_files_storage.sql

-- Bucket exists?
SELECT id, name, public, file_size_limit, allowed_mime_types
FROM storage.buckets
WHERE id = 'comfort-files';

-- Policies on storage.objects for comfort-files
SELECT policyname, roles, cmd
FROM pg_policies
WHERE schemaname = 'storage'
  AND tablename = 'objects'
  AND policyname LIKE 'comfort_files%';

-- Recent uploads (paths only)
SELECT name, created_at, metadata
FROM storage.objects
WHERE bucket_id = 'comfort-files'
ORDER BY created_at DESC
LIMIT 20;
