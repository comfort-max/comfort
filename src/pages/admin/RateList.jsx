import React, { useRef, useState, useMemo } from "react";
import { db } from "@/services/SupabaseService";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  parseRateListFile,
  downloadRateListBlankCsvTemplate,
  RATE_LIST_EXPORT_COLUMNS,
} from "@/lib/rateListImportExport";
import { downloadTableAsCsv, downloadTableAsExcel } from "@/lib/tableDataExport";
import { usePermissions } from "@/hooks/usePermissions";

const IMPORT_CHUNK = 250;

async function replaceAllRateListItems(parsed, existingItems) {
  await Promise.all(existingItems.map((item) => db.RateListItem.delete(item.id)));
  for (let i = 0; i < parsed.length; i += IMPORT_CHUNK) {
    await db.RateListItem.bulkCreate(parsed.slice(i, i + IMPORT_CHUNK));
  }
}

function sortRateExportRows(items) {
  return [...items].sort(
    (a, b) =>
      String(a.category || "").localeCompare(String(b.category || "")) ||
      String(a.item_name || "").localeCompare(String(b.item_name || ""))
  );
}

export default function RateList() {
  const qc = useQueryClient();
  const uploadRef = useRef(null);
  const { format: fmt, code: curCode } = useAppCurrency();
  const { can } = usePermissions();
  const canDeleteRateList = can("admin_rate_list", "delete");
  const canEditRateList = can("admin_rate_list", "edit");
  const canExportRateList = can("admin_rate_list", "export");
  const canImportRateList = can("admin_rate_list", "import");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ item_name: "", category: "Ladies", price: 0 });
  const [importing, setImporting] = useState(false);

  const { data: items = [] } = useQuery({
    queryKey: ["rate-list-all"],
    queryFn: () => db.RateListItem.list("category", 5000),
  });

  const categoryTabs = useMemo(() => orderedDisplayCategories(items), [items]);

  const saveMutation = useMutation({
    mutationFn: (data) => {
      const payload = {
        ...data,
        item_name: String(data.item_name || "").trim(),
        category: String(data.category || "").trim(),
      };
      return editingId ? db.RateListItem.update(editingId, payload) : db.RateListItem.create(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rate-list-all"] });
      qc.invalidateQueries({ queryKey: ["rate-list"] });
      setShowForm(false);
      setEditingId(null);
      toast.success("Saved");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => db.RateListItem.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rate-list-all"] });
      qc.invalidateQueries({ queryKey: ["rate-list"] });
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

  const buildExportRows = () =>
    sortRateExportRows(items).map((i) => ({
      item_name: i.item_name,
      category: i.category,
      price: Number(i.price) || 0,
    }));

  const handleExportCsv = async () => {
    const rows = buildExportRows();
    if (!rows.length) {
      toast.error("Nothing to export");
      return;
    }
    const settings = await fetchCompanySettings();
    downloadTableAsCsv(rows, RATE_LIST_EXPORT_COLUMNS, settings, "Rate_List", { currencyAsNumber: true });
    toast.success("Exported CSV");
  };

  const handleExportExcel = async () => {
    const rows = buildExportRows();
    if (!rows.length) {
      toast.error("Nothing to export");
      return;
    }
    const settings = await fetchCompanySettings();
    downloadTableAsExcel(rows, RATE_LIST_EXPORT_COLUMNS, settings, "Rate_List", "Rate List", { currencyAsNumber: true });
    toast.success("Exported Excel");
  };

  const runImport = async (parsed, errors, inputEl) => {
    if (parsed.length === 0) {
      toast.error(errors[0] || "No valid rows to import");
      if (inputEl) inputEl.value = "";
      return;
    }
    if (errors.length > 0) {
      const preview = errors.slice(0, 5).join(" · ");
      toast.warning(`${errors.length} row issue(s). Importing ${parsed.length} valid row(s). ${preview}`);
    }
    setImporting(true);
    try {
      const existingItems = qc.getQueryData(["rate-list-all"]) ?? [];
      await replaceAllRateListItems(parsed, existingItems);
      qc.invalidateQueries({ queryKey: ["rate-list-all"] });
      qc.invalidateQueries({ queryKey: ["rate-list"] });
      toast.success(`Imported ${parsed.length} item(s). Previous list was replaced.`);
    } catch (err) {
      toast.error(err?.message || "Import failed");
    } finally {
      setImporting(false);
      if (inputEl) inputEl.value = "";
    }
  };

  const handleUploadRateList = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const { items: parsed, errors } = await parseRateListFile(file);
      await runImport(parsed, errors, e.target);
    } catch (err) {
      toast.error(err?.message || "Could not read file");
      e.target.value = "";
    }
  };

  return (
    <div>
      <PageHeader title="Rate List" subtitle="Manage company rate list for billing" permissionResource="admin_rate_list">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={downloadRateListBlankCsvTemplate}
            title="Download blank CSV template (headings only)"
            disabled={!canImportRateList}
          >
            <Download className="w-4 h-4" />
            Template
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" size="sm" className="gap-1.5" disabled={!items.length || !canExportRateList}>
                Export rate list
                <ChevronDown className="w-4 h-4 opacity-70" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={handleExportCsv}>Export as CSV</DropdownMenuItem>
              <DropdownMenuItem onSelect={handleExportExcel}>Export as Excel</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <input
            ref={uploadRef}
            type="file"
            accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
            className="hidden"
            disabled={importing || !canImportRateList}
            onChange={handleUploadRateList}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={importing || !canImportRateList}
            onClick={() => uploadRef.current?.click()}
          >
            <Upload className="w-4 h-4" />
            Upload rate list
          </Button>

          <Button
            size="sm"
            className="gap-1"
            disabled={!canEditRateList}
            onClick={() => {
              setForm({ item_name: "", category: "Ladies", price: 0 });
              setEditingId(null);
              setShowForm(true);
            }}
          >
            <Plus className="w-4 h-4" /> Add item
          </Button>
        </div>
      </PageHeader>

      <p className="text-xs text-muted-foreground mb-4 max-w-3xl">
        <strong>Template</strong> downloads a blank CSV with column headings only: Item Name, Category, Price (any
        category name; common presets: {RATE_LIST_DEFAULT_CATEGORIES.join(", ")}). <strong>Export</strong> downloads everything on the site for this list. Price
        is numeric in CSV; Excel uses a currency number format from Company Settings. <strong>Upload</strong> accepts CSV
        or Excel; the first row with those three columns is detected. Upload replaces the entire company rate list. New
        categories appear as extra sections automatically.
      </p>

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
                    <th className="text-right py-1.5">Price ({curCode})</th>
                    <th className="w-20"></th>
                  </tr>
                </thead>
                <tbody>
                  {items
                    .filter((i) => i.category === cat)
                    .map((item) => (
                      <tr key={item.id} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="py-1.5">{item.item_name}</td>
                        <td className="py-1.5 text-right font-medium">{fmt(item.price)}</td>
                        <td className="py-1.5">
                          <div className="flex gap-1 justify-end">
                            {canEditRateList && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => {
                                setForm({
                                  item_name: item.item_name,
                                  category: item.category,
                                  price: item.price,
                                });
                                setEditingId(item.id);
                                setShowForm(true);
                              }}
                            >
                              <Pencil className="w-3 h-3" />
                            </Button>
                            )}
                            {canDeleteRateList && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-destructive"
                                onClick={() => deleteMutation.mutate(item.id)}
                              >
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  {items.filter((i) => i.category === cat).length === 0 && (
                    <tr>
                      <td colSpan={3} className="text-center py-4 text-muted-foreground text-xs">
                        No items
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit" : "Add"} Item</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div>
              <Label>Item Name *</Label>
              <Input value={form.item_name} onChange={(e) => setForm({ ...form, item_name: e.target.value })} />
            </div>
            <RateCategoryField
              id="rate-list-company-cat"
              value={form.category}
              onChange={(category) => setForm({ ...form, category })}
              options={categoryTabs}
            />
            <div>
              <Label>Price ({curCode}) *</Label>
              <Input
                type="number"
                value={form.price}
                onChange={(e) => setForm({ ...form, price: Number(e.target.value) })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
            <Button onClick={() => saveMutation.mutate(form)} disabled={!canEditRateList || !form.item_name?.trim() || !form.price || !form.category?.trim()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
