import React, { useRef, useState, useMemo } from "react";
import { db } from "@/services/SupabaseService";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RateCategoryField } from "@/components/shared/RateCategoryField";
import { Plus, Pencil, Trash2, Upload, Download, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { useAppCurrency } from "@/hooks/useAppCurrency";
import {
  RATE_LIST_DEFAULT_CATEGORIES,
  orderedDisplayCategories,
  RATE_LIST_EXPORT_COLUMNS,
} from "@/lib/rateListImportExport";
import { downloadVendorRateBlankCsvTemplate, parseVendorRateListFile } from "@/lib/vendorRateImportExport";
import { downloadTableAsCsv, downloadTableAsExcel, sanitizeExportFilenameBase } from "@/lib/tableDataExport";
import { sortByLocaleKey } from "@/lib/utils";
import { usePermissions } from "@/hooks/usePermissions";

const IMPORT_CHUNK = 250;

async function replaceVendorRatesForVendor(parsed, vendorId, vendorName, existingRows) {
  await Promise.all(existingRows.map((r) => db.VendorRate.delete(r.id)));
  const payload = parsed.map((i) => ({ ...i, vendor_id: vendorId, vendor_name: vendorName }));
  for (let i = 0; i < payload.length; i += IMPORT_CHUNK) {
    await db.VendorRate.bulkCreate(payload.slice(i, i + IMPORT_CHUNK));
  }
}

function sortRateExportRows(rows) {
  return [...rows].sort(
    (a, b) =>
      String(a.category || "").localeCompare(String(b.category || "")) ||
      String(a.item_name || "").localeCompare(String(b.item_name || ""))
  );
}

export default function VendorRates() {
  const qc = useQueryClient();
  const uploadSelectedRef = useRef(null);
  const dialogFileRef = useRef(null);
  const { format: fmt, code: curCode } = useAppCurrency();
  const { can } = usePermissions();
  const canEditVendorRates = can("admin_vendor_rates", "edit");
  const canDeleteVendorRates = can("admin_vendor_rates", "delete");
  const canExportVendorRates = can("admin_vendor_rates", "export");
  const canImportVendorRates = can("admin_vendor_rates", "import");
  const [selectedVendor, setSelectedVendor] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ item_name: "", category: "Ladies", price: 0 });
  const [importing, setImporting] = useState(false);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [uploadDialogVendorId, setUploadDialogVendorId] = useState("");
  const [uploadDialogFile, setUploadDialogFile] = useState(null);

  const { data: vendors = [] } = useQuery({ queryKey: ["vendors-active"], queryFn: () => db.Vendor.filter({ status: "active" }) });
  const { data: rates = [] } = useQuery({ queryKey: ["vendor-rates-all"], queryFn: () => db.VendorRate.list("vendor_id", 5000) });
  const { data: companyRateItems = [] } = useQuery({
    queryKey: ["rate-list-all"],
    queryFn: () => db.RateListItem.list("category", 5000),
    staleTime: 5 * 60 * 1000,
  });

  const vendorRates = selectedVendor ? rates.filter((r) => r.vendor_id === selectedVendor) : [];
  const vendor = vendors.find((v) => v.id === selectedVendor);
  const categoryTabs = useMemo(() => orderedDisplayCategories(vendorRates), [vendorRates]);
  /** Form suggestions: this vendor’s categories plus company list (and presets via orderedDisplayCategories). */
  const categoryFormOptions = useMemo(
    () => orderedDisplayCategories([...vendorRates, ...companyRateItems]),
    [vendorRates, companyRateItems]
  );
  const vendorsSorted = useMemo(() => sortByLocaleKey(vendors), [vendors]);

  const invalidateVendorRateQueries = () => {
    qc.invalidateQueries({ queryKey: ["vendor-rates-all"] });
    qc.invalidateQueries({ queryKey: ["vendor-rates"] });
  };

  const saveMutation = useMutation({
    mutationFn: (data) => {
      const payload = {
        ...data,
        item_name: String(data.item_name || "").trim(),
        category: String(data.category || "").trim(),
        vendor_id: selectedVendor,
        vendor_name: vendor?.name || "",
      };
      return editingId ? db.VendorRate.update(editingId, payload) : db.VendorRate.create(payload);
    },
    onSuccess: () => {
      invalidateVendorRateQueries();
      setShowForm(false);
      setEditingId(null);
      toast.success("Saved");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => db.VendorRate.delete(id),
    onSuccess: () => {
      invalidateVendorRateQueries();
      toast.success("Deleted");
    },
  });

  const fetchCompanySettings = async () => {
    try {
      const list = await db.CompanySettings.list();
      return list[0] || {};
    } catch {
      return {};
    }
  };

  const buildExportRowsForVendor = (vendorId) => {
    const list = rates.filter((r) => r.vendor_id === vendorId);
    return sortRateExportRows(list).map((r) => ({
      item_name: r.item_name,
      category: r.category,
      price: Number(r.price) || 0,
    }));
  };

  const handleExportVendorCsv = async (vendorId, vendorName) => {
    const rows = buildExportRowsForVendor(vendorId);
    if (!rows.length) {
      toast.error("Nothing to export for this vendor");
      return;
    }
    const settings = await fetchCompanySettings();
    const base = `Vendor_Rates_${sanitizeExportFilenameBase(vendorName)}`;
    downloadTableAsCsv(rows, RATE_LIST_EXPORT_COLUMNS, settings, base, { currencyAsNumber: true });
    toast.success("Exported CSV");
  };

  const handleExportVendorExcel = async (vendorId, vendorName) => {
    const rows = buildExportRowsForVendor(vendorId);
    if (!rows.length) {
      toast.error("Nothing to export for this vendor");
      return;
    }
    const settings = await fetchCompanySettings();
    const base = `Vendor_Rates_${sanitizeExportFilenameBase(vendorName)}`;
    downloadTableAsExcel(rows, RATE_LIST_EXPORT_COLUMNS, settings, base, "Vendor Rates", { currencyAsNumber: true });
    toast.success("Exported Excel");
  };

  const applyImportForVendor = async (vendorId, vendorName, parsed, errors, options = {}) => {
    const { resetFileInput, onImported } = options;
    if (!vendorId) {
      toast.error("Choose which vendor this rate list is for");
      resetFileInput?.();
      return;
    }
    if (parsed.length === 0) {
      toast.error(errors[0] || "No valid rows to import");
      resetFileInput?.();
      return;
    }
    if (errors.length > 0) {
      const preview = errors.slice(0, 5).join(" · ");
      toast.warning(`${errors.length} row issue(s). Importing ${parsed.length} valid row(s). ${preview}`);
    }
    setImporting(true);
    try {
      const allRates = qc.getQueryData(["vendor-rates-all"]) ?? [];
      const existing = allRates.filter((r) => r.vendor_id === vendorId);
      await replaceVendorRatesForVendor(parsed, vendorId, vendorName, existing);
      invalidateVendorRateQueries();
      toast.success(`Imported ${parsed.length} rate(s) for ${vendorName}. Previous rates for this vendor were replaced.`);
      onImported?.();
    } catch (err) {
      toast.error(err?.message || "Import failed");
    } finally {
      setImporting(false);
      resetFileInput?.();
    }
  };

  const handleUploadSelectedVendor = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !selectedVendor) return;
    try {
      const { items: parsed, errors } = await parseVendorRateListFile(file);
      await applyImportForVendor(selectedVendor, vendor?.name || "", parsed, errors, {
        resetFileInput: () => {
          e.target.value = "";
        },
      });
    } catch (err) {
      toast.error(err?.message || "Could not read file");
      e.target.value = "";
    }
  };

  const handleDialogImport = async () => {
    if (!uploadDialogVendorId || !uploadDialogFile) {
      toast.error("Select a vendor and a file");
      return;
    }
    const vendorIdToImport = uploadDialogVendorId;
    const v = vendors.find((x) => x.id === vendorIdToImport);
    const name = v?.name || "";
    try {
      const { items: parsed, errors } = await parseVendorRateListFile(uploadDialogFile);
      await applyImportForVendor(vendorIdToImport, name, parsed, errors, {
        resetFileInput: () => {
          setUploadDialogFile(null);
          if (dialogFileRef.current) dialogFileRef.current.value = "";
        },
        onImported: () => {
          setSelectedVendor(vendorIdToImport);
          setUploadDialogOpen(false);
          setUploadDialogVendorId("");
        },
      });
    } catch (err) {
      toast.error(err?.message || "Could not read file");
    }
  };

  const openGlobalUploadDialog = () => {
    setUploadDialogVendorId("");
    setUploadDialogFile(null);
    if (dialogFileRef.current) dialogFileRef.current.value = "";
    setUploadDialogOpen(true);
  };

  const exportDisabled = !selectedVendor || vendorRates.length === 0;

  return (
    <div>
      <PageHeader title="Vendor Rates" subtitle="Manage rate lists for each vendor" permissionResource="admin_vendor_rates">
        <div className="flex flex-wrap items-center gap-2">
          {canExportVendorRates && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={downloadVendorRateBlankCsvTemplate}
              title="Download blank CSV template (headings only)"
            >
              <Download className="w-4 h-4" />
              Template
            </Button>
          )}

          {selectedVendor ? (
            <>
              {canExportVendorRates && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="outline" size="sm" className="gap-1.5" disabled={exportDisabled}>
                    Export rate list
                    <ChevronDown className="w-4 h-4 opacity-70" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => handleExportVendorCsv(selectedVendor, vendor?.name || "")}>
                    Export as CSV
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => handleExportVendorExcel(selectedVendor, vendor?.name || "")}>
                    Export as Excel
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              )}

              {canImportVendorRates && (
                <>
                  <input
                    ref={uploadSelectedRef}
                    type="file"
                    accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                    className="hidden"
                    disabled={importing}
                    onChange={handleUploadSelectedVendor}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    disabled={importing}
                    onClick={() => uploadSelectedRef.current?.click()}
                  >
                    <Upload className="w-4 h-4" />
                    Upload rate list
                  </Button>
                </>
              )}

              {canEditVendorRates && (
              <Button
                size="sm"
                className="gap-1"
                onClick={() => {
                  setForm({ item_name: "", category: "Ladies", price: 0 });
                  setEditingId(null);
                  setShowForm(true);
                }}
              >
                <Plus className="w-4 h-4" /> Add rate
              </Button>
              )}
            </>
          ) : (
            canImportVendorRates && (
            <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={openGlobalUploadDialog} disabled={importing}>
              <Upload className="w-4 h-4" />
              Upload rate list
            </Button>
            )
          )}
        </div>
      </PageHeader>

      <p className="text-xs text-muted-foreground mb-4 max-w-3xl">
        <strong>Template</strong> is a blank CSV (Item Name, Category, Price — any category name; presets:{" "}
        {RATE_LIST_DEFAULT_CATEGORIES.join(", ")}). Before a vendor is selected, <strong>Upload rate list</strong> asks
        which vendor the file is for; after a successful import, that vendor is selected in the dropdown below (you can
        change it anytime). After you select a vendor, upload and export apply only to that vendor. CSV or Excel is
        accepted; the header row is auto-detected. Exported Price values are numbers in CSV; Excel applies the currency
        format from Company Settings. New categories from import or the form appear as their own sections.
      </p>

      <div className="mb-6">
        <Label>Select vendor</Label>
        <Select value={selectedVendor} onValueChange={setSelectedVendor}>
          <SelectTrigger className="w-64">
            <SelectValue placeholder="Choose vendor" />
          </SelectTrigger>
          <SelectContent>
            {vendorsSorted.map((v) => (
              <SelectItem key={v.id} value={v.id}>
                {v.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {selectedVendor && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {categoryTabs.map((cat) => (
            <Card key={cat} className="border-0 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">{cat}</CardTitle>
              </CardHeader>
              <CardContent>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-xs text-muted-foreground">
                      <th className="text-left py-1.5">Item</th>
                      <th className="text-right py-1.5">Rate ({curCode})</th>
                      <th className="w-20"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {vendorRates
                      .filter((r) => r.category === cat)
                      .map((r) => (
                        <tr key={r.id} className="border-b last:border-0">
                          <td className="py-1.5">{r.item_name}</td>
                          <td className="py-1.5 text-right font-medium">{fmt(r.price || 0)}</td>
                          <td className="py-1.5">
                            <div className="flex gap-1 justify-end">
                              {canEditVendorRates && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={() => {
                                  setForm({ item_name: r.item_name, category: r.category, price: r.price });
                                  setEditingId(r.id);
                                  setShowForm(true);
                                }}
                              >
                                <Pencil className="w-3 h-3" />
                              </Button>
                              )}
                              {canDeleteVendorRates && (
                                <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => deleteMutation.mutate(r.id)}>
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    {vendorRates.filter((r) => r.category === cat).length === 0 && (
                      <tr>
                        <td colSpan={3} className="text-center py-4 text-muted-foreground text-xs">
                          No rates set
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog
        open={uploadDialogOpen}
        onOpenChange={(open) => {
          setUploadDialogOpen(open);
          if (!open) {
            setUploadDialogVendorId("");
            setUploadDialogFile(null);
            if (dialogFileRef.current) dialogFileRef.current.value = "";
          }
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Upload rate list</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Choose which vendor this file belongs to, then pick a CSV or Excel file.</p>
          <div className="grid gap-4 py-2">
            <div>
              <Label>Vendor *</Label>
              <Select value={uploadDialogVendorId} onValueChange={setUploadDialogVendorId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose vendor" />
                </SelectTrigger>
                <SelectContent>
                  {vendorsSorted.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>File (.csv or .xlsx) *</Label>
              <Input
                ref={dialogFileRef}
                type="file"
                accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                onChange={(e) => setUploadDialogFile(e.target.files?.[0] || null)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleDialogImport} disabled={!uploadDialogVendorId || !uploadDialogFile || importing}>
              {importing ? "Importing…" : "Import"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit" : "Add"} Rate</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div>
              <Label>Item Name *</Label>
              <Input value={form.item_name} onChange={(e) => setForm({ ...form, item_name: e.target.value })} />
            </div>
            <RateCategoryField
              id="rate-list-vendor-cat"
              value={form.category}
              onChange={(category) => setForm({ ...form, category })}
              options={categoryFormOptions}
            />
            <div>
              <Label>Rate ({curCode})</Label>
              <Input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: Number(e.target.value) })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
            <Button onClick={() => saveMutation.mutate(form)} disabled={!canEditVendorRates || !form.item_name?.trim() || !form.category?.trim()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
