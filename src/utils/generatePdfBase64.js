import { jsPDF } from 'jspdf';
import { toPdfSafeText } from '@/lib/utils';
import { formatCurrencyAmountPdf } from '@/lib/currency';

/**
 * Generates a PDF from structured data and returns it as a base64 string (no data: prefix).
 * @param {object} opts
 * @param {string} opts.title
 * @param {string} [opts.subtitle]
 * @param {string} [opts.dateRange]
 * @param {Array<{header: string, key: string}>} opts.columns
 * @param {Array<object>} opts.rows
 * @param {object} [opts.companySettings]
 * @param {number} [opts.grandTotal]
 * @returns {string} base64 encoded PDF
 */
export function generatePdfBase64({ title, subtitle, dateRange, columns, rows, companySettings = {}, grandTotal }) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 14;
  const companyName = toPdfSafeText(companySettings.company_name || 'COMFORT');
  const primaryColor = [42, 122, 140]; // #2a7a8c

  // Header
  doc.setFillColor(...primaryColor);
  doc.rect(0, 0, pageW, 18, 'F');
  doc.setFontSize(14);
  doc.setTextColor(255, 255, 255);
  doc.setFont(undefined, 'bold');
  doc.text(companyName, margin, 12);
  doc.setFontSize(9);
  doc.setFont(undefined, 'normal');
  doc.text(toPdfSafeText(title), pageW - margin, 12, { align: 'right' });

  let y = 24;
  if (subtitle) {
    doc.setFontSize(10);
    doc.setTextColor(60, 60, 60);
    doc.setFont(undefined, 'bold');
    doc.text(toPdfSafeText(subtitle), margin, y);
    y += 6;
  }
  if (dateRange) {
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.setFont(undefined, 'normal');
    doc.text(toPdfSafeText(dateRange), margin, y);
    y += 5;
  }
  y += 2;

  // Column widths
  const usableW = pageW - margin * 2;
  const avgLen = columns.map(c => {
    const maxLen = Math.max(c.header.length, ...rows.map(r => String(r[c.key] ?? '').length));
    return Math.max(maxLen, 6);
  });
  const total = avgLen.reduce((s, v) => s + v, 0);
  const colWidths = avgLen.map(l => (l / total) * usableW);

  // Table header
  doc.setFillColor(...primaryColor);
  doc.rect(margin, y, usableW, 7, 'F');
  doc.setFontSize(8);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(255, 255, 255);
  let x = margin;
  columns.forEach((col, i) => {
    doc.text(toPdfSafeText(col.header), x + 2, y + 5);
    x += colWidths[i];
  });
  y += 7;

  // Rows
  doc.setFont(undefined, 'normal');
  const currencyKeys = ['amount', 'rate', 'total', 'paid', 'due', 'salary', 'price', 'fee'];
  const isCurrency = (key) => currencyKeys.some(k => key.toLowerCase().includes(k));

  rows.forEach((row, idx) => {
    if (y > pageH - 20) {
      doc.addPage();
      y = 14;
    }
    if (idx % 2 === 0) {
      doc.setFillColor(240, 249, 251);
      doc.rect(margin, y, usableW, 6, 'F');
    }
    doc.setFontSize(8);
    doc.setTextColor(30, 30, 30);
    x = margin;
    columns.forEach((col, i) => {
      let val = row[col.key] ?? '';
      if (isCurrency(col.key) && typeof val === 'number') {
        val = toPdfSafeText(formatCurrencyAmountPdf(val, companySettings));
      } else {
        val = toPdfSafeText(String(val ?? ''));
      }
      doc.text(String(val).substring(0, 35), x + 2, y + 4.5);
      x += colWidths[i];
    });
    y += 6;
  });

  // Grand total
  if (grandTotal !== undefined) {
    y += 2;
    doc.setFillColor(224, 242, 245);
    doc.rect(margin, y, usableW, 7, 'F');
    doc.setFontSize(9);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(...primaryColor);
    doc.text('Total Amount:', pageW - margin - 40, y + 5);
    doc.text(toPdfSafeText(formatCurrencyAmountPdf(grandTotal, companySettings)), pageW - margin - 2, y + 5, { align: 'right' });
    y += 7;
  }

  const totalPages = doc.internal.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    const footerY = pageH - 8;
    doc.setDrawColor(...primaryColor);
    doc.setLineWidth(0.5);
    doc.line(margin, footerY - 3, pageW - margin, footerY - 3);
    doc.setFontSize(7);
    doc.setTextColor(120, 120, 120);
    doc.setFont(undefined, 'normal');
    if (companySettings.address) doc.text(toPdfSafeText(companySettings.address), margin, footerY);
    doc.text(`Page ${p} of ${totalPages}`, pageW - margin, footerY, { align: 'right' });
  }

  return doc.output('datauristring').split(',')[1]; // base64 only
}