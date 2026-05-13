import * as XLSX from "xlsx";
import { localeDisplayCompare } from "@/lib/utils";

/** Preset categories (shown first when empty; suggested in forms). New categories from data/import are supported. */
export const RATE_LIST_DEFAULT_CATEGORIES = ["Ladies", "Gents", "Woolen", "Household"];

/** @deprecated Use RATE_LIST_DEFAULT_CATEGORIES */
export const RATE_LIST_CATEGORIES = RATE_LIST_DEFAULT_CATEGORIES;

/**
 * Unique category names for tabs / dropdowns: presets plus any from data, all A–Z.
 * @param {Array<{ category?: string } | string>} rows — rate rows or plain category strings
 */
export function orderedDisplayCategories(rows) {
  const names = [];
  for (const row of rows || []) {
    if (row == null) continue;
    const c = typeof row === "string" ? row : row.category;
    const t = String(c ?? "").trim().replace(/\s+/g, " ");
    if (t) names.push(t);
  }
  const set = new Set([...RATE_LIST_DEFAULT_CATEGORIES, ...names]);
  return [...set].sort(localeDisplayCompare);
}

const HEADER_ALIASES = {
  item_name: [
    "item name",
    "item_name",
    "name",
    "item",
    "service",
    "service item",
    "description",
    "item description",
  ],
  category: ["category", "type", "cat"],
  price: ["price", "rate", "amount", "unit price", "unitprice", "mrp"],
};

function normalizeHeaderCell(cell) {
  return String(cell ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function fieldForHeader(cell) {
  const n = normalizeHeaderCell(cell);
  if (!n) return null;
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    if (aliases.includes(n)) return field;
  }
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    if (aliases.some((a) => n === a || n.endsWith(` ${a}`) || n.startsWith(`${a} `)))
      return field;
  }
  return null;
}

/** First row (within scan) where item, category, and price columns are identified */
function detectHeaderRow(rows, maxScan = 25) {
  const limit = Math.min(maxScan, rows.length);
  for (let r = 0; r < limit; r++) {
    const row = rows[r] || [];
    const colMap = {};
    row.forEach((cell, c) => {
      const f = fieldForHeader(cell);
      if (f && colMap[f] === undefined) colMap[f] = c;
    });
    if (colMap.item_name !== undefined && colMap.category !== undefined && colMap.price !== undefined) {
      return { headerRowIndex: r, colMap };
    }
  }
  return null;
}

function normalizeCategory(raw) {
  const s = String(raw ?? "")
    .trim()
    .replace(/\s+/g, " ");
  if (!s) return null;
  if (s.length > 120) return s.slice(0, 120);
  return s;
}

function parsePrice(val) {
  if (val === "" || val === null || val === undefined) return NaN;
  if (typeof val === "number" && !Number.isNaN(val)) return val;
  // Formatted cells (e.g. "₹1,234.56", "EUR 12,50") after Excel/CSV round-trip
  let s = String(val)
    .trim()
    .replace(/\p{Sc}/gu, "")
    .replace(/[^\d.,\-]/g, "");
  if (!s || s === "-" || s === "." || s === ",") return NaN;

  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  let normalized;
  // US-style thousands: 1,234 or 1,234.56
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) {
    normalized = s.replace(/,/g, "");
  } else if (lastComma > lastDot) {
    normalized = s.replace(/\./g, "").replace(/,/g, ".");
  } else {
    normalized = s.replace(/,/g, "");
  }
  const n = Number(normalized);
  return Number.isFinite(n) ? n : NaN;
}

/**
 * @param {Array<Array>} rows - from CSV or Excel (array of arrays)
 * @returns {{ items: Array<{item_name: string, category: string, price: number}>, errors: string[] }}
 */
export function parseRateListGrid(rows) {
  const errors = [];
  const detected = detectHeaderRow(rows);
  if (!detected) {
    return {
      items: [],
      errors: [
        "Could not find a header row with columns: Item Name (or Name), Category, and Price (or Rate).",
      ],
    };
  }
  const { headerRowIndex, colMap } = detected;
  const items = [];
  for (let r = headerRowIndex + 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const item_name = String(row[colMap.item_name] ?? "").trim();
    const category = normalizeCategory(row[colMap.category]);
    const price = parsePrice(row[colMap.price]);
    if (!item_name && !category && (row[colMap.price] === "" || row[colMap.price] == null)) continue;
    if (!item_name) {
      errors.push(`Row ${r + 1}: missing item name`);
      continue;
    }
    if (!category) {
      errors.push(`Row ${r + 1}: missing or empty category`);
      continue;
    }
    if (!Number.isFinite(price) || price < 0) {
      errors.push(`Row ${r + 1}: invalid price`);
      continue;
    }
    items.push({ item_name, category, price });
  }
  return { items, errors };
}

function splitCsvLine(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes && c === ",") {
      out.push(cur.trim());
      cur = "";
      continue;
    }
    cur += c;
  }
  out.push(cur.trim());
  return out;
}

/** Split CSV text into lines respecting quoted newlines (minimal) */
export function parseCsvToRows(text) {
  const lines = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') inQuotes = !inQuotes;
    if (!inQuotes && (c === "\n" || (c === "\r" && text[i + 1] === "\n"))) {
      if (c === "\r") i++;
      if (cur.trim()) lines.push(cur);
      cur = "";
      continue;
    }
    if (!inQuotes && c === "\r") {
      if (cur.trim()) lines.push(cur);
      cur = "";
      continue;
    }
    cur += c;
  }
  if (cur.trim()) lines.push(cur);
  return lines.map(splitCsvLine);
}

export function parseRateListCsvText(text) {
  const rows = parseCsvToRows(text.replace(/^\uFEFF/, ""));
  return parseRateListGrid(rows);
}

export function parseRateListExcelBuffer(buffer) {
  const wb = XLSX.read(buffer, { type: "array" });
  if (!wb.SheetNames.length) {
    return { items: [], errors: ["Workbook has no sheets."] };
  }
  const sheet = wb.Sheets[wb.SheetNames[0]];
  // raw: true keeps numeric cells as numbers (round-trip from our exports); raw: false turns ₹1,234.00 into unparseable strings
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: true });
  return parseRateListGrid(rows);
}

/**
 * Parse a user file as CSV or Excel from extension / type.
 * @param {File} file
 * @returns {Promise<{ items: object[], errors: string[] }>}
 */
export async function parseRateListFile(file) {
  if (!file) return { items: [], errors: ["No file selected."] };
  const name = file.name.toLowerCase();
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    const buf = await file.arrayBuffer();
    return parseRateListExcelBuffer(buf);
  }
  if (name.endsWith(".csv")) {
    const text = await file.text();
    return parseRateListCsvText(text);
  }
  return { items: [], errors: ["Use a .csv or Excel file (.xlsx / .xls)."] };
}

export const RATE_LIST_TEMPLATE_HEADER = ["Item Name", "Category", "Price"];

/** Sample rows (e.g. optional docs); blank template uses header only. */
export const RATE_LIST_TEMPLATE_SAMPLE_ROWS = [
  ["Blouse", "Ladies", 45],
  ["Formal Shirt", "Gents", 55],
  ["Blanket (single)", "Household", 120],
];

/** Column order for CSV/Excel exports (company + vendor rate lists). */
export const RATE_LIST_EXPORT_COLUMNS = [
  { header: "Item Name", key: "item_name" },
  { header: "Category", key: "category" },
  { header: "Price", key: "price" },
];

/** Blank CSV: header row only (UTF-8 BOM). */
export function downloadRateListBlankCsvTemplate() {
  const line = RATE_LIST_TEMPLATE_HEADER.map((cell) =>
    String(cell).includes(",") || String(cell).includes('"') ? `"${String(cell).replace(/"/g, '""')}"` : cell
  ).join(",");
  const blob = new Blob(["\uFEFF" + line], { type: "text/csv;charset=utf-8" });
  triggerDownload(blob, "comfort-rate-list-template.csv");
}

/** @deprecated Use downloadRateListBlankCsvTemplate */
export function downloadRateListCsvTemplate() {
  downloadRateListBlankCsvTemplate();
}

/** Optional sample-filled Excel (not used on main Rate List toolbar). */
export function downloadRateListXlsxTemplate() {
  const aoa = [RATE_LIST_TEMPLATE_HEADER, ...RATE_LIST_TEMPLATE_SAMPLE_ROWS, ["", "", ""]];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 28 }, { wch: 14 }, { wch: 10 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Rate List");
  const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  triggerDownload(blob, "comfort-rate-list-template.xlsx");
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
