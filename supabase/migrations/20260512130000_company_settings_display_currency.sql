-- Display currency for amounts across the app (ISO 4217 code; symbols resolved in UI).

ALTER TABLE company_settings
  ADD COLUMN IF NOT EXISTS display_currency_code text DEFAULT 'INR';

UPDATE company_settings
SET display_currency_code = 'INR'
WHERE display_currency_code IS NULL OR trim(display_currency_code) = '';

ALTER TABLE company_settings
  ALTER COLUMN display_currency_code SET DEFAULT 'INR';

ALTER TABLE company_settings
  ALTER COLUMN display_currency_code SET NOT NULL;
