-- Comfort app file storage: bills receipts, expense receipts, vendor payment proofs,
-- company logo, etc. (see uploadFile in src/services/SupabaseService.js).
-- Idempotent — safe to run more than once in Supabase SQL Editor.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'comfort-files',
  'comfort-files',
  false,
  5242880,
  ARRAY[
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/webp',
    'application/pdf'
  ]::text[]
)
ON CONFLICT (id) DO UPDATE
SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Authenticated app users (logged in) can manage files in this bucket.
DROP POLICY IF EXISTS "comfort_files_authenticated_select" ON storage.objects;
CREATE POLICY "comfort_files_authenticated_select"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'comfort-files');

DROP POLICY IF EXISTS "comfort_files_authenticated_insert" ON storage.objects;
CREATE POLICY "comfort_files_authenticated_insert"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'comfort-files');

DROP POLICY IF EXISTS "comfort_files_authenticated_update" ON storage.objects;
CREATE POLICY "comfort_files_authenticated_update"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (bucket_id = 'comfort-files')
  WITH CHECK (bucket_id = 'comfort-files');

DROP POLICY IF EXISTS "comfort_files_authenticated_delete" ON storage.objects;
CREATE POLICY "comfort_files_authenticated_delete"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (bucket_id = 'comfort-files');

-- Login page / branding: read logo objects without signing in (optional; tighten if needed).
DROP POLICY IF EXISTS "comfort_files_anon_select" ON storage.objects;
CREATE POLICY "comfort_files_anon_select"
  ON storage.objects
  FOR SELECT
  TO anon
  USING (bucket_id = 'comfort-files');
