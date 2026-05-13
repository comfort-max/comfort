import { getComfortFilesDisplayUrl } from "@/services/SupabaseService";
import { escapeHtml, sanitizeMojibakeText } from "@/lib/utils";
import { formatCurrencyAmount } from "@/lib/currency";

/**
 * Renders a hidden printable frame with company header/footer.
 * Call `triggerPrint()` to open the print dialog showing only this frame.
 */
export function buildPrintHTML({ title, subtitle, columns, rows, companySettings, dateRange }) {
  const s = companySettings || {};
  const companyName = String(s.company_name || 'COMFORT');
  const logoUrl = s.logo_url || '';
  const address = String(s.address || '');
  const email = String(s.email || '');
  const phones = [s.phone_office, s.phone_customer_care, s.phone_sales].filter(Boolean).join('  |  ');
  const footerLine2 = [email, phones].filter(Boolean).join('     ');

  const dateRangeHtml = dateRange
    ? `<div class="date-range">Period: ${escapeHtml(sanitizeMojibakeText(String(dateRange)))}</div>`
    : '';

  const headerLogoHtml = logoUrl
    ? `<img src="${logoUrl}" alt="Logo" class="logo" />`
    : `<div class="logo-placeholder">${escapeHtml(companyName.charAt(0))}</div>`;

  // Smart column widths based on content length
  const getColWeight = (col) => {
    const headerLen = String(col.header).length;
    const maxDataLen = rows.reduce((max, row) => Math.max(max, String(row[col.key] ?? '').length), 0);
    return Math.max(headerLen, maxDataLen, 4);
  };
  const weights = columns.map(getColWeight);
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const colPercents = weights.map(w => ((w / totalWeight) * 100).toFixed(1));

  const isCurrencyColumn = (header) => {
    const currencyKeywords = ['amount', 'price', 'total', 'cost', 'paid', 'due', 'salary', 'rate', 'fee'];
    return currencyKeywords.some(kw => header.toLowerCase().includes(kw));
  };

  const formatCellValue = (col, value) => {
    if (isCurrencyColumn(col.header) && typeof value === 'number') {
      return escapeHtml(sanitizeMojibakeText(formatCurrencyAmount(value, s)));
    }
    return escapeHtml(sanitizeMojibakeText(String(value ?? '')));
  };

  const theadCells = columns.map((c, i) => `<th style="width:${colPercents[i]}%">${escapeHtml(String(c.header))}</th>`).join('');
  const tbodyRows = rows.map(row =>
    `<tr>${columns.map(c => `<td style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${formatCellValue(c, row[c.key])}</td>`).join('')}</tr>`
  ).join('');

  const isLandscape = columns.length > 6;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<title>${escapeHtml(String(title))}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #222; }
  .page { padding: 20mm 15mm 25mm 15mm; min-height: 100vh; position: relative; }

  /* Header */
  .report-header { display: flex; align-items: center; gap: 16px; border-bottom: 2px solid #2a7a8c; padding-bottom: 12px; margin-bottom: 8px; }
  .logo { height: 56px; width: auto; object-fit: contain; }
  .logo-placeholder { width: 56px; height: 56px; background: #2a7a8c; color: #fff; font-size: 28px; font-weight: 800; display: flex; align-items: center; justify-content: center; border-radius: 8px; }
  .header-text { flex: 1; }
  .company-name { font-size: 22px; font-weight: 800; color: #2a7a8c; letter-spacing: 1px; }
  .company-tagline { font-size: 10px; color: #666; margin-top: 2px; }

  /* Report title */
  .report-title-block { margin: 10px 0 4px; }
  .report-title { font-size: 15px; font-weight: 700; color: #222; }
  .date-range { font-size: 10px; color: #555; margin-top: 3px; font-style: italic; }

  /* Table */
  table { width: 100%; border-collapse: collapse; margin-top: 10px; table-layout: fixed; }
  th { background: #2a7a8c; color: #fff; padding: 7px 8px; text-align: left; font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
  td { padding: 6px 8px; border-bottom: 1px solid #e5e7eb; font-size: 11px; }
  tr:nth-child(even) td { background: #f0f9fb; }
  tr:last-child td { border-bottom: none; }

  /* Footer */
  .report-footer { position: fixed; bottom: 10mm; left: 15mm; right: 15mm; border-top: 1.5px solid #2a7a8c; padding-top: 6px; }
  .footer-address { text-align: center; font-size: 9px; color: #444; font-weight: 600; }
  .footer-contacts { text-align: center; font-size: 9px; color: #666; margin-top: 2px; }

  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    @page {
      margin: 14mm 14mm 18mm 14mm;
      size: ${isLandscape ? "A4 landscape" : "A4 portrait"};
      @bottom-right {
        content: "Page " counter(page) " of " counter(pages);
        font-size: 9px;
        color: #888;
        font-family: Arial, Helvetica, sans-serif;
      }
    }
    .report-footer { position: relative; bottom: auto; left: auto; right: auto; margin-top: 12px; padding-bottom: 2mm; }
  }
</style>
<script>
  window.addEventListener('afterprint', function() { window.close(); });
</script>
</head>
<body>
<div class="page">
  <div class="report-header">
    ${headerLogoHtml}
    <div class="header-text">
      <div class="company-name">${escapeHtml(companyName)}</div>
      <div class="company-tagline">Laundry Management System</div>
    </div>
  </div>

  <div class="report-title-block">
    <div class="report-title">${escapeHtml(String(title))}</div>
    ${dateRangeHtml}
  </div>

  <table>
    <thead><tr>${theadCells}</tr></thead>
    <tbody>${tbodyRows}</tbody>
  </table>

  <div class="report-footer">
    ${address ? `<div class="footer-address">${escapeHtml(sanitizeMojibakeText(address))}</div>` : ''}
    ${footerLine2 ? `<div class="footer-contacts">${escapeHtml(sanitizeMojibakeText(footerLine2))}</div>` : ''}
  </div>
</div>
</body>
</html>`;
}

export async function printReport({ title, subtitle, columns, rows, companySettings, dateRange }) {
  let settings = companySettings || {};
  if (settings.logo_url) {
    try {
      const signed = await getComfortFilesDisplayUrl(settings.logo_url);
      settings = { ...settings, logo_url: signed };
    } catch (_) {}
  }
  const html = buildPrintHTML({ title, columns, rows, companySettings: settings, dateRange });
  const win = window.open('', '_blank', 'width=900,height=700');
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); }, 600);
}

// Helper to add page count to print output
export async function printReportWithPageCount({ title, subtitle, columns, rows, companySettings, dateRange }) {
  let settings = companySettings || {};
  if (settings.logo_url) {
    try {
      const signed = await getComfortFilesDisplayUrl(settings.logo_url);
      settings = { ...settings, logo_url: signed };
    } catch (_) {}
  }
  const html = buildPrintHTML({ title, columns, rows, companySettings: settings, dateRange });
  const modifiedHtml = html.replace(
    /<span class="pagenum">1<\/span>/g,
    '<span class="pagenum"></span> of <span class="totalpages"></span>'
  ).replace(
    '<script>',
    `<script>
    // Calculate total pages
    window.addEventListener('load', function() {
      const pageCount = Math.ceil(document.body.scrollHeight / window.innerHeight);
      const pageNums = document.querySelectorAll('.pagenum');
      const totalPages = document.querySelectorAll('.totalpages');
      let currentPage = 1;
      pageNums.forEach(el => el.textContent = currentPage);
      totalPages.forEach(el => el.textContent = Math.max(1, Math.ceil(document.body.offsetHeight / 1100)));
    });
    `
  );
  const win = window.open('', '_blank', 'width=900,height=700');
  if (!win) return;
  win.document.write(modifiedHtml);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); }, 600);
}