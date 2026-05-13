import { jsPDF } from "jspdf";
import { getComfortFilesDisplayUrl } from "@/services/SupabaseService";
import { toPdfSafeText } from "@/lib/utils";
import { formatCurrencyAmountPdf } from "@/lib/currency";

/**
 * Generates a professional PDF with company letterhead header and footer.
 */
export async function exportPDF({ title, dateRange, columns, rows, companySettings }) {
  const s = companySettings || {};
  const companyName = toPdfSafeText(s.company_name || 'COMFORT');
  let logoUrl = s.logo_url || '';
  if (logoUrl) {
    try {
      logoUrl = await getComfortFilesDisplayUrl(logoUrl);
    } catch (_) {}
  }
  const address = toPdfSafeText(s.address || '');
  const email = toPdfSafeText(s.email || '');
  const phones = [s.phone_office, s.phone_customer_care, s.phone_sales].filter(Boolean).map(toPdfSafeText).join('  |  ');
  const footerLine1 = address;
  const footerLine2 = [email, phones].filter(Boolean).join('     ');

  // Auto-switch to landscape when many columns or wide content
  const orientation = columns.length > 6 ? 'landscape' : 'portrait';
  const doc = new jsPDF({ orientation, unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const marginL = 15;
  const marginR = 15;
  const contentW = pageW - marginL - marginR;

  // Load logo
  let logoData = null;
  if (logoUrl) {
    try {
      logoData = await fetchImageAsBase64(logoUrl);
    } catch (_) {}
  }

  const safeTitle = toPdfSafeText(title);
  const safeDateRange = dateRange ? toPdfSafeText(dateRange) : '';

  // -- HEADER --
  const drawHeader = (doc, pageNum) => {
    if (pageNum === 1) {
      // Logo or placeholder box
      if (logoData) {
        doc.addImage(logoData.data, logoData.format, marginL, 8, 18, 18);
      } else {
        doc.setFillColor(42, 122, 140);
        doc.roundedRect(marginL, 8, 18, 18, 2, 2, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(16);
        doc.setTextColor(255, 255, 255);
        const initial = toPdfSafeText(companyName).charAt(0) || 'C';
        doc.text(initial, marginL + 9, 20, { align: 'center' });
      }
      // Company name
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(20);
      doc.setTextColor(42, 122, 140);
      doc.text(companyName, marginL + 22, 17);
      // Tagline
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      doc.text('Laundry Management System', marginL + 22, 22);
      // Rule
      doc.setDrawColor(42, 122, 140);
      doc.setLineWidth(0.7);
      doc.line(marginL, 30, pageW - marginR, 30);
      // Report title
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.setTextColor(30, 30, 30);
      doc.text(safeTitle, marginL, 38);
      // Date range
      if (safeDateRange) {
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(8);
        doc.setTextColor(80, 80, 80);
        doc.text(`Period: ${safeDateRange}`, marginL, 44);
      }
    } else {
      // Compact header for subsequent pages
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(42, 122, 140);
      doc.text(companyName, marginL, 10);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(60, 60, 60);
      doc.text(`${safeTitle}${safeDateRange ? '  -  ' + safeDateRange : ''}`, marginL, 15);
      doc.setDrawColor(42, 122, 140);
      doc.setLineWidth(0.3);
      doc.line(marginL, 17, pageW - marginR, 17);
    }
  };

  // -- FOOTER --
  const drawFooter = (doc, pageNum, totalPages) => {
    const footerY = pageH - 14;
    doc.setDrawColor(42, 122, 140);
    doc.setLineWidth(0.4);
    doc.line(marginL, footerY - 3, pageW - marginR, footerY - 3);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);

    if (footerLine1) {
      doc.setTextColor(60, 60, 60);
      doc.text(footerLine1, pageW / 2, footerY + 1, { align: 'center' });
    }
    if (footerLine2) {
      doc.setTextColor(100, 100, 100);
      doc.text(footerLine2, pageW / 2, footerY + 5, { align: 'center' });
    }
    // Page number
    doc.setTextColor(130, 130, 130);
    doc.text(`Page ${pageNum} of ${totalPages}`, pageW - marginR, footerY + 5, { align: 'right' });
  };

  // -- TABLE (manual draw) --
  // Smart column widths: measure max content length per column, distribute proportionally
  const getColWeight = (col) => {
    const headerLen = String(col.header).length;
    const maxDataLen = rows.reduce((max, row) => {
      return Math.max(max, String(row[col.key] ?? '').length);
    }, 0);
    return Math.max(headerLen, maxDataLen, 4);
  };
  const weights = columns.map(getColWeight);
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const colWidths = weights.map(w => (w / totalWeight) * contentW);
  const rowHeight = 8;
  const headerHeight = 9;
  const firstTableY = safeDateRange ? 48 : 42;
  const subsequentTableY = 21;

  let currentPage = 1;
  drawHeader(doc, 1);

  let y = firstTableY;

  const drawTableHeader = (y) => {
    doc.setFillColor(42, 122, 140);
    doc.rect(marginL, y, contentW, headerHeight, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(255, 255, 255);
    let x = marginL;
    columns.forEach((col, i) => {
      doc.text(toPdfSafeText(String(col.header)), x + 2, y + 6, { maxWidth: colWidths[i] - 3 });
      x += colWidths[i];
    });
    return y + headerHeight;
  };

  const isCurrencyColumn = (header) => {
    const currencyKeywords = ['amount', 'price', 'total', 'cost', 'paid', 'due', 'salary', 'rate', 'fee'];
    return currencyKeywords.some(kw => header.toLowerCase().includes(kw));
  };

  const formatCellValue = (col, value) => {
    if (isCurrencyColumn(col.header) && typeof value === 'number') {
      return toPdfSafeText(formatCurrencyAmountPdf(value, s));
    }
    return toPdfSafeText(String(value ?? ''));
  };

  const drawRow = (row, y, isEven) => {
    if (isEven) {
      doc.setFillColor(240, 249, 251);
      doc.rect(marginL, y, contentW, rowHeight, 'F');
    }
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(30, 30, 30);
    let x = marginL;
    columns.forEach((col, i) => {
      const val = formatCellValue(col, row[col.key]);
      doc.text(val, x + 2, y + 5.5, { maxWidth: colWidths[i] - 3 });
      x += colWidths[i];
    });
    // Bottom border
    doc.setDrawColor(220, 220, 220);
    doc.setLineWidth(0.2);
    doc.line(marginL, y + rowHeight, pageW - marginR, y + rowHeight);
  };

  const footerAreaH = 18;
  const usableH = pageH - footerAreaH;

  y = drawTableHeader(y);

  rows.forEach((row, idx) => {
    if (y + rowHeight > usableH) {
      // Draw footer for current page, add new page
      drawFooter(doc, currentPage, 1); // placeholder total
      doc.addPage();
      currentPage++;
      drawHeader(doc, currentPage);
      y = drawTableHeader(subsequentTableY);
    }
    drawRow(row, y, idx % 2 === 1);
    y += rowHeight;
  });

  // Now fix footers with real page count
  const totalPages = doc.internal.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    drawFooter(doc, p, totalPages);
  }

  doc.save(`${title.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`);
}

async function fetchImageAsBase64(url) {
  const res = await fetch(url);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const format = blob.type.includes('png') ? 'PNG' : 'JPEG';
      resolve({ data: reader.result, format });
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}