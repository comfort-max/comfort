-- Financial year rule: first calendar day of each financial year (month 1-12, day 1-31).
-- Default matches India (1 April). Calendar-year example: month 1, day 1.

ALTER TABLE company_settings
  ADD COLUMN IF NOT EXISTS financial_year_start_month smallint DEFAULT 4;

ALTER TABLE company_settings
  ADD COLUMN IF NOT EXISTS financial_year_start_day smallint DEFAULT 1;

UPDATE company_settings
SET
  financial_year_start_month = 4
WHERE financial_year_start_month IS NULL;

UPDATE company_settings
SET
  financial_year_start_day = 1
WHERE financial_year_start_day IS NULL;

ALTER TABLE company_settings
  ALTER COLUMN financial_year_start_month SET DEFAULT 4,
  ALTER COLUMN financial_year_start_day SET DEFAULT 1;

ALTER TABLE company_settings
  ALTER COLUMN financial_year_start_month SET NOT NULL,
  ALTER COLUMN financial_year_start_day SET NOT NULL;
