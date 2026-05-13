import { clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs) {
  return twMerge(clsx(inputs))
}

/** Case-insensitive A–Z for labels in lists; numeric substrings sort numerically. */
export function localeDisplayCompare(a, b) {
  return String(a ?? "").localeCompare(String(b ?? ""), undefined, { sensitivity: "base", numeric: true })
}

/** Shallow copy sorted by a string field (default `name`). */
export function sortByLocaleKey(rows, key = "name") {
  return [...(rows || [])].sort((x, y) => localeDisplayCompare(x?.[key], y?.[key]))
}

/** Alphabetically sorted copy for filter and picker options (names, labels, etc.). Not for calendar month order — use {@link CALENDAR_MONTH_NAMES}. */
export function sortStringsForDisplay(arr) {
  return [...(arr || [])].sort(localeDisplayCompare);
}

/**
 * Full month names in calendar order (1–12). Use for month `<Select>` options.
 * Do not pass this list through {@link sortStringsForDisplay} or {@link sortByLocaleKey}.
 */
export const CALENDAR_MONTH_NAMES = Object.freeze([
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
]);

/** Fix UTF-8 em dash / bullet that was mis-decoded (often shows as â€" or â€¢ in UI). */
export function sanitizeMojibakeText(str) {
  if (str == null || typeof str !== "string") return str
  return str
    .replace(/\u00E2\u20AC\u201C/g, "\u2014") // em dash as UTF-8 read as Windows-1252
    .replace(/\u00E2\u20AC\u201D/g, "\u2014")
    .replace(/â€"/g, "\u2014")
    .replace(/\u00E2\u0080\u00A2/g, "\u2022") // bullet •
    .replace(/â€¢/g, "\u2022")
}

/**
 * jsPDF default fonts (Helvetica) use WinAnsi only; Unicode punctuation and rupee sign render as mojibake (e.g. "â€"").
 * Use this for every string passed to doc.text() in PDF generators.
 */
export function toPdfSafeText(str) {
  if (str == null) return ""
  let s = sanitizeMojibakeText(String(str))
  return s
    .replace(/\u2014/g, " - ") // em dash
    .replace(/\u2013/g, " - ") // en dash
    .replace(/\u2212/g, "-") // minus
    .replace(/\u2022/g, "*") // bullet
    .replace(/\u20B9/g, "Rs.") // rupee
    .replace(/\u00B7/g, ", ") // middle dot (used as separator in UI copy)
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u00A0/g, " ")
}

/** Escape text embedded in print HTML (prevents broken markup; keeps UTF-8 safe). */
export function escapeHtml(str) {
  if (str == null) return ""
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}