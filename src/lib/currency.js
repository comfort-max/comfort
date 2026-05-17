/**
 * App-wide display currency (Admin: Company Settings).
 * `code` is stored in `company_settings.display_currency_code`.
 */

import { localeDisplayCompare } from "./utils";
import { normalizeCompanySettingsRow } from "./companySettingsPayload";

/** @typedef {{ code: string, label: string, symbol: string, locale: string, pdfPrefix: string }} CurrencyOption */

const CURRENCY_OPTIONS_RAW = [
  { code: "INR", label: "India - INR (Rs)", symbol: "\u20B9", locale: "en-IN", pdfPrefix: "Rs." },
  { code: "USD", label: "United States - USD ($)", symbol: "$", locale: "en-US", pdfPrefix: "$" },
  { code: "GBP", label: "United Kingdom - GBP (GBP)", symbol: "\u00A3", locale: "en-GB", pdfPrefix: "GBP " },
  { code: "EUR", label: "Eurozone - EUR (EUR)", symbol: "\u20AC", locale: "de-DE", pdfPrefix: "EUR " },
  { code: "AUD", label: "Australia - AUD (A$)", symbol: "A$", locale: "en-AU", pdfPrefix: "AUD " },
  { code: "CAD", label: "Canada - CAD (C$)", symbol: "C$", locale: "en-CA", pdfPrefix: "CAD " },
  { code: "SGD", label: "Singapore - SGD (S$)", symbol: "S$", locale: "en-SG", pdfPrefix: "SGD " },
  { code: "AED", label: "United Arab Emirates - AED", symbol: "AED ", locale: "en-AE", pdfPrefix: "AED " },
  { code: "SAR", label: "Saudi Arabia - SAR", symbol: "SAR ", locale: "en-SA", pdfPrefix: "SAR " },
  { code: "MYR", label: "Malaysia - MYR (RM)", symbol: "RM ", locale: "en-MY", pdfPrefix: "MYR " },
  { code: "THB", label: "Thailand - THB", symbol: "\u0E3F", locale: "th-TH", pdfPrefix: "THB " },
  { code: "PHP", label: "Philippines - PHP", symbol: "\u20B1", locale: "en-PH", pdfPrefix: "PHP " },
  { code: "IDR", label: "Indonesia - IDR (Rp)", symbol: "Rp ", locale: "id-ID", pdfPrefix: "IDR " },
  { code: "BDT", label: "Bangladesh - BDT", symbol: "\u09F3", locale: "en-BD", pdfPrefix: "BDT " },
  { code: "LKR", label: "Sri Lanka - LKR", symbol: "Rs ", locale: "en-LK", pdfPrefix: "LKR " },
  { code: "NPR", label: "Nepal - NPR", symbol: "Rs ", locale: "ne-NP", pdfPrefix: "NPR " },
  { code: "CNY", label: "China - CNY", symbol: "\u00A5", locale: "zh-CN", pdfPrefix: "CNY " },
  { code: "JPY", label: "Japan - JPY", symbol: "\u00A5", locale: "ja-JP", pdfPrefix: "JPY " },
  { code: "ZAR", label: "South Africa - ZAR", symbol: "R ", locale: "en-ZA", pdfPrefix: "ZAR " },
  { code: "KES", label: "Kenya - KES", symbol: "KSh ", locale: "en-KE", pdfPrefix: "KES " },
  { code: "NGN", label: "Nigeria - NGN", symbol: "\u20A6", locale: "en-NG", pdfPrefix: "NGN " },
  { code: "NZD", label: "New Zealand - NZD (NZ$)", symbol: "NZ$", locale: "en-NZ", pdfPrefix: "NZD " },
];

/** @type {CurrencyOption[]} — alphabetical by label for all currency dropdowns */
export const CURRENCY_OPTIONS = [...CURRENCY_OPTIONS_RAW].sort((a, b) => localeDisplayCompare(a.label, b.label));

const BY_CODE = Object.fromEntries(CURRENCY_OPTIONS.map((o) => [o.code, o]));

/**
 * @param {object | null | undefined} settings company_settings row
 * @returns {CurrencyOption}
 */
export function getCurrencyConfig(settings) {
  const row = normalizeCompanySettingsRow(settings);
  const code = String(row.display_currency_code || "INR").trim().toUpperCase();
  return BY_CODE[code] || BY_CODE.INR;
}

/**
 * @param {number | string} amount
 * @param {object | null | undefined} settings company_settings row
 */
export function formatCurrencyAmount(amount, settings) {
  const c = getCurrencyConfig(settings);
  const n = Number(amount);
  const num = Number.isFinite(n) ? n : 0;
  const fraction = c.code === "JPY" ? 0 : 2;
  const formatted = num.toLocaleString(c.locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: fraction,
  });
  return `${c.symbol}${formatted}`;
}

/**
 * jsPDF-friendly: ASCII prefix + localized number (no Unicode currency glyphs in prefix).
 */
export function formatCurrencyAmountPdf(amount, settings) {
  const c = getCurrencyConfig(settings);
  const n = Number(amount);
  const num = Number.isFinite(n) ? n : 0;
  const fraction = c.code === "JPY" ? 0 : 2;
  const formatted = num.toLocaleString(c.locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: fraction,
  });
  return `${c.pdfPrefix}${formatted}`;
}

/**
 * Excel custom number format for a numeric currency column (uses Company Settings currency).
 * Symbol is embedded as literal text; decimals match in-app display (JPY: 0, else 2).
 * @param {object | null | undefined} settings company_settings row
 * @returns {string}
 */
export function getExcelCurrencyNumberFormat(settings) {
  const c = getCurrencyConfig(settings);
  const decimals = c.code === "JPY" ? 0 : 2;
  const sym = String(c.symbol).replace(/"/g, '""');
  if (decimals === 0) {
    return `"${sym}"#,##0`;
  }
  return `"${sym}"#,##0.00`;
}
