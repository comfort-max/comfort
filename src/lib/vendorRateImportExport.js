import { RATE_LIST_TEMPLATE_HEADER } from "@/lib/rateListImportExport";

/**
 * Vendor CSV/Excel import uses the same implementation as the company rate list:
 * numeric Excel cells (`raw: true`), currency-formatted strings, thousands separators, dynamic categories.
 */
export { parseRateListFile as parseVendorRateListFile } from "@/lib/rateListImportExport";

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

/** Blank CSV: same header row as company rate list (UTF-8 BOM). */
export function downloadVendorRateBlankCsvTemplate() {
  const line = RATE_LIST_TEMPLATE_HEADER.map((cell) =>
    String(cell).includes(",") || String(cell).includes('"') ? `"${String(cell).replace(/"/g, '""')}"` : cell
  ).join(",");
  const blob = new Blob(["\uFEFF" + line], { type: "text/csv;charset=utf-8" });
  triggerDownload(blob, "comfort-vendor-rate-template.csv");
}
