import React from "react";
import { Button } from "@/components/ui/button";
import { Download, FileSpreadsheet, Printer, FileText, FileDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { db } from "@/services/SupabaseService";
import { exportPDF } from "@/components/shared/exportPDF";
import { printReport } from "@/components/shared/PrintReport";
import { downloadTableAsCsv, downloadTableAsExcel } from "@/lib/tableDataExport";
import { toast } from "sonner";
import { usePermissions } from "@/hooks/usePermissions";

/**
 * PageHeader
 * Props:
 *   title        - page title (string)
 *   subtitle     - optional subtitle (string)
 *   exportData   - array of plain objects for CSV/Excel/PDF/Print export
 *   exportColumns- optional [{header, key}] to control column order
 *                  if omitted, columns are inferred from exportData keys
 *   dateRange    - optional date range string shown as sub-header in PDF/print
 *   onExport     - legacy callback (optional) — invoked with "csv" | "excel" | "pdf" | "print" when there is no data
 *   permissionResource - optional RBAC resource key (e.g. "bills"); when set, export/print is allowed only if role has `export`
 *   children     - action buttons shown in the header
 */
export default function PageHeader({
  title,
  subtitle,
  children,
  onExport,
  exportData,
  exportColumns,
  dateRange,
  permissionResource,
}) {
  const { can } = usePermissions();
  const exportAllowed = permissionResource ? can(permissionResource, "export") : true;
  const getColumns = () => {
    if (exportColumns) return exportColumns;
    if (!exportData || exportData.length === 0) return [];
    return Object.keys(exportData[0]).map((k) => ({ header: k, key: k }));
  };

  const getRows = () => {
    if (!exportData) return [];
    const cols = getColumns();
    return exportData.map((row) => {
      const r = {};
      cols.forEach((c) => {
        r[c.key] = row[c.key] ?? row[c.header] ?? "";
      });
      return r;
    });
  };

  const fetchCompanySettings = async () => {
    try {
      const list = await db.CompanySettings.list();
      return list[0] || {};
    } catch (_) {
      return {};
    }
  };

  const doCSV = async () => {
    if (!exportAllowed) {
      toast.error("You do not have export permission for this page.");
      return;
    }
    if (!exportData || exportData.length === 0) {
      if (onExport) onExport("csv");
      else toast.error("Nothing to export");
      return;
    }
    const settings = await fetchCompanySettings();
    const ok = downloadTableAsCsv(exportData, exportColumns, settings, title);
    if (!ok) toast.error("Nothing to export");
  };

  const doExcel = async () => {
    if (!exportAllowed) {
      toast.error("You do not have export permission for this page.");
      return;
    }
    if (!exportData || exportData.length === 0) {
      if (onExport) onExport("excel");
      else toast.error("Nothing to export");
      return;
    }
    const settings = await fetchCompanySettings();
    const ok = downloadTableAsExcel(exportData, exportColumns, settings, title, "Export");
    if (!ok) toast.error("Nothing to export");
  };

  const doPDF = async () => {
    if (!exportAllowed) {
      toast.error("You do not have export permission for this page.");
      return;
    }
    if (!exportData || exportData.length === 0) {
      if (onExport) onExport("pdf");
      else toast.error("Nothing to export");
      return;
    }
    const companySettings = await fetchCompanySettings();
    await exportPDF({
      title,
      dateRange,
      columns: getColumns(),
      rows: getRows(),
      companySettings,
    });
  };

  const doPrint = async () => {
    if (!exportAllowed) {
      toast.error("You do not have export permission for this page.");
      return;
    }
    if (!exportData || exportData.length === 0) {
      if (onExport) onExport("print");
      else toast.error("Nothing to export");
      return;
    }
    const companySettings = await fetchCompanySettings();
    await printReport({
      title,
      dateRange,
      columns: getColumns(),
      rows: getRows(),
      companySettings,
    });
  };

  const hasExport = !!(onExport || exportData) && exportAllowed;

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">

      <div>
        <h1 className="text-2xl font-bold tracking-tight text-primary">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
        {dateRange ? (
          <p className="text-xs text-muted-foreground mt-1.5 font-medium">Period: {dateRange}</p>
        ) : null}
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {hasExport && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <Download className="w-4 h-4" /> Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={doCSV}>
                <FileDown className="w-4 h-4 mr-2" /> Export as CSV
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={doExcel}>
                <FileSpreadsheet className="w-4 h-4 mr-2" /> Export as Excel
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={doPDF}>
                <FileText className="w-4 h-4 mr-2" /> Export as PDF
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={doPrint}>
                <Printer className="w-4 h-4 mr-2" /> Print
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {children}
      </div>
    </div>
  );
}
