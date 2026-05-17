/**
 * Fields the Company Settings form may persist. Only keys that exist on the loaded
 * `company_settings` row are sent on update, so older databases without optional
 * columns (e.g. display_currency_code) still save successfully.
 */
/** Always written from the form when saving (even if the loaded row omitted optional columns). */
export const COMPANY_SETTINGS_FORCE_FROM_FORM = new Set([
  "display_currency_code",
  "ui_theme_preset",
  "financial_year_start_month",
  "financial_year_start_day",
]);

export const COMPANY_SETTINGS_PERSIST_KEYS = [
  "company_name",
  "logo_url",
  "address",
  "email",
  "phone_customer_care",
  "phone_office",
  "phone_sales",
  "payment_terms",
  "enable_bill_receipts",
  "enable_vendor_payment_proof",
  "enable_customer_payment_proof",
  "financial_year_start_month",
  "financial_year_start_day",
  "display_currency_code",
  "ui_theme_preset",
];

/**
 * @param {Record<string, unknown>} form
 * @param {Record<string, unknown> | null | undefined} existingRow
 */
/**
 * @param {Record<string, unknown>} form
 * @param {Record<string, unknown> | null | undefined} existingRow
 */
export function pickCompanySettingsPersistPayload(form, existingRow) {
  const out = {};
  for (const key of COMPANY_SETTINGS_PERSIST_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(form, key)) continue;
    if (existingRow == null) {
      out[key] = form[key];
      continue;
    }
    if (
      COMPANY_SETTINGS_FORCE_FROM_FORM.has(key) ||
      Object.prototype.hasOwnProperty.call(existingRow, key)
    ) {
      out[key] = form[key];
    }
  }
  return out;
}

/**
 * Normalize settings row for currency / theme reads (handles legacy rows missing optional columns).
 * @param {Record<string, unknown> | null | undefined} row
 */
export function normalizeCompanySettingsRow(row) {
  if (!row) return { display_currency_code: "INR", ui_theme_preset: "default" };
  const code = row.display_currency_code;
  return {
    ...row,
    display_currency_code:
      code == null || String(code).trim() === ""
        ? "INR"
        : String(code).trim().toUpperCase(),
  };
}
