import * as XLSX from "xlsx";
import { formatCurrencyAmount, getExcelCurrencyNumberFormat } from "@/lib/currency";

/**
 * @param {string} name
 * @returns {string}
 */
export function sanitizeExportFilenameBase(name) {
  return (
    String(name || "export")
      .replace(/\s+/g, "_")
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "")
      .slice(0, 120) || "export"
  );
}

/**
 * @param {object[]} exportData
 * @param {{ header: string, key: string }[] | null | undefined} exportColumns
 * @returns {{ header: string, key: string }[]}
 */
export function getExportColumnDefs(exportData, exportColumns) {
  if (exportColumns?.length) {
    return exportColumns.map((c) => ({ header: c.header, key: c.key }));
  }
  if (!exportData?.length) return [];
  return Object.keys(exportData[0]).map((k) => ({ header: k, key: k }));
}

function isCurrencyColumnLabel(h) {
  const currencyKeywords = ["amount", "price", "total", "cost", "paid", "due", "salary", "rate", "fee"];
  return currencyKeywords.some((kw) => String(h).toLowerCase().includes(kw));
}

function isCurrencyCol(col) {
  return isCurrencyColumnLabel(col.header) || isCurrencyColumnLabel(col.key);
}

/**
 * @param {object[]} exportData
 * @param {{ header: string, key: string }[] | null | undefined} exportColumns
 * @param {object} settings company_settings row (optional)
 * @param {{ currencyAsNumber?: boolean }} options when currencyAsNumber, price-like columns export as raw numbers (CSV/Excel)
 * @returns {{ headers: string[], rows: (string|number)[][] }}
 */
export function buildExportMatrix(exportData, exportColumns, settings = {}, options = {}) {
  const { currencyAsNumber = false } = options;
  const cols = getExportColumnDefs(exportData, exportColumns);
  if (!cols.length) return { headers: [], rows: [] };
  const headers = cols.map((c) => c.header);
  const rows = (exportData || []).map((row) =>
    cols.map((c) => {
      const raw = row[c.key] ?? row[c.header];
      if (isCurrencyCol(c)) {
        const n = Number(raw);
        const num = Number.isFinite(n) ? n : 0;
        if (currencyAsNumber) return num;
        if (typeof raw === "number") {
          return formatCurrencyAmount(raw, settings);
        }
        return formatCurrencyAmount(num, settings);
      }
      return raw ?? "";
    })
  );
  return { headers, rows };
}

/**
 * @param {string[]} headers
 * @param {(string|number)[][]} rows
 */
export function matrixToCsvString(headers, rows) {
  const esc = (cell) => {
    const str = String(cell ?? "");
    return str.includes(",") || str.includes("\n") || str.includes('"')
      ? `"${str.replace(/"/g, '""')}"`
      : str;
  };
  return [headers.map(esc).join(","), ...rows.map((r) => r.map(esc).join(","))].join("\n");
}

function triggerBlobDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function applyExcelCurrencyNumberFormats(ws, exportData, exportColumns, settings) {
  if (!ws["!ref"]) return;
  const cols = getExportColumnDefs(exportData, exportColumns);
  const currencyColIndices = cols.map((c, i) => (isCurrencyCol(c) ? i : -1)).filter((i) => i >= 0);
  if (!currencyColIndices.length) return;
  const numFmt = getExcelCurrencyNumberFormat(settings);
  const range = XLSX.utils.decode_range(ws["!ref"]);
  for (let R = range.s.r + 1; R <= range.e.r; R++) {
    for (const C of currencyColIndices) {
      const addr = XLSX.utils.encode_cell({ r: R, c: C });
      const cell = ws[addr];
      if (cell && (cell.t === "n" || typeof cell.v === "number")) {
        cell.t = "n";
        cell.v = Number(cell.v);
        cell.z = numFmt;
      }
    }
  }
}

/**
 * @returns {boolean} true if a file was generated
 */
export function downloadTableAsCsv(exportData, exportColumns, settings, titleForFilename, exportOptions = {}) {
  const base = sanitizeExportFilenameBase(titleForFilename);
  const { headers, rows } = buildExportMatrix(exportData, exportColumns, settings, exportOptions);
  if (!headers.length) return false;
  const csv = matrixToCsvString(headers, rows);
  const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8;" });
  triggerBlobDownload(blob, `${base}_export.csv`);
  return true;
}

/**
 * @returns {boolean} true if a file was generated
 */
export function downloadTableAsExcel(exportData, exportColumns, settings, titleForFilename, sheetName = "Export", exportOptions = {}) {
  const base = sanitizeExportFilenameBase(titleForFilename);
  const { headers, rows } = buildExportMatrix(exportData, exportColumns, settings, exportOptions);
  if (!headers.length) return false;
  const aoa = [headers, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  if (exportOptions.currencyAsNumber) {
    applyExcelCurrencyNumberFormats(ws, exportData, exportColumns, settings);
  }
  const wb = XLSX.utils.book_new();
  const safeSheet = String(sheetName || "Export").replace(/[\[\]:\\/?*]/g, "_").slice(0, 31);
  XLSX.utils.book_append_sheet(wb, ws, safeSheet || "Export");
  XLSX.writeFile(wb, `${base}_export.xlsx`);
  return true;
}

/**
 * Raw grid export (e.g. incentive slabs) — values as-is for round-trip CSV/Excel.
 * @param {(string|number|null|undefined)[][]} aoa
 * @param {string} filename
 */
export function downloadCsvFromAoa(aoa, filename) {
  if (!aoa?.length) return false;
  const lines = aoa.map((row) =>
    row
      .map((cell) => {
        const str = cell === null || cell === undefined ? "" : String(cell);
        return str.includes(",") || str.includes("\n") || str.includes('"')
          ? `"${str.replace(/"/g, '""')}"`
          : str;
      })
      .join(",")
  );
  const blob = new Blob(["\uFEFF", lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  triggerBlobDownload(blob, filename);
  return true;
}

/**
 * @param {(string|number|null|undefined)[][]} aoa
 * @param {{ sheetName?: string, filename: string }} opts
 */
export function downloadExcelFromAoa(aoa, { sheetName = "Sheet1", filename }) {
  if (!aoa?.length) return false;
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const safeSheet = String(sheetName || "Sheet1").replace(/[\[\]:\\/?*]/g, "_").slice(0, 31);
  XLSX.utils.book_append_sheet(wb, ws, safeSheet || "Sheet1");
  XLSX.writeFile(wb, filename);
  return true;
}
