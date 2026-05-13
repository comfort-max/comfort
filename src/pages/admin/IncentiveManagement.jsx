import React, { useState, useRef } from "react";
import { db } from "@/services/SupabaseService";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, Upload, AlertTriangle, CheckCircle2, FileDown, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { useAppCurrency } from "@/hooks/useAppCurrency";
import { usePermissions } from "@/hooks/usePermissions";
import { downloadCsvFromAoa, downloadExcelFromAoa } from "@/lib/tableDataExport";

const emptyForm = { employee_type: 'full_time', min_sales: 0, max_sales: 0, incentive_percentage: 0, incentive_fixed: 0 };

function validateSlabs(slabs, fmt) {
  const sorted = [...slabs].sort((a, b) => a.min_sales - b.min_sales);
  const issues = [];
  for (let i = 0; i < sorted.length; i++) {
    const cur = sorted[i];
    const curMin = Math.round(cur.min_sales || 0);
    const curMax = cur.max_sales ? Math.round(cur.max_sales) : null;
    if (i > 0) {
      const prev = sorted[i - 1];
      const prevMax = prev.max_sales ? Math.round(prev.max_sales) : null;
      if (prevMax === null) issues.push(`Overlap: Slab ${fmt(Math.round(prev.min_sales))}–∞ already covers all values above it`);
      else if (prevMax >= curMin) issues.push(`Overlap detected in slabs`);
      else if (prevMax + 1 < curMin) issues.push(`Gap: Sales of ${fmt(prevMax + 1)} to ${fmt(curMin - 1)} not covered`);
    }
    if ((cur.incentive_percentage || 0) === 0 && (cur.incentive_fixed || 0) === 0) issues.push(`Slab has no incentive defined`);
  }
  return issues;
}

function SlabTable({ slabs, onEdit, onDelete, fmt, curCode, canDelete }) {
  const sorted = [...slabs].sort((a, b) => a.min_sales - b.min_sales);
  if (sorted.length === 0) return <div className="text-center text-muted-foreground py-10 text-sm">No slabs defined yet.</div>;
  return (
    <div className="border rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead><tr className="bg-muted/50 text-xs text-muted-foreground"><th className="text-left px-4 py-2.5">Min Sales</th><th className="text-left px-4 py-2.5">Max Sales</th><th className="text-left px-4 py-2.5">Incentive %</th><th className="text-left px-4 py-2.5">Fixed ({curCode})</th><th className="px-4 py-2.5"></th></tr></thead>
        <tbody>
          {sorted.map(r => (
            <tr key={r.id} className="border-t hover:bg-muted/30">
              <td className="px-4 py-2.5 font-medium">{fmt(r.min_sales || 0)}</td>
              <td className="px-4 py-2.5">{r.max_sales ? fmt(r.max_sales) : <span className="text-muted-foreground">∞</span>}</td>
              <td className="px-4 py-2.5">{r.incentive_percentage ? <Badge variant="outline" className="text-primary border-primary/30">{r.incentive_percentage}%</Badge> : <span className="text-muted-foreground">-</span>}</td>
              <td className="px-4 py-2.5">{r.incentive_fixed ? fmt(r.incentive_fixed) : <span className="text-muted-foreground">-</span>}</td>
              <td className="px-4 py-2.5"><div className="flex gap-1 justify-end"><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(r)}><Pencil className="w-3.5 h-3.5" /></Button>{canDelete && <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => onDelete(r.id)}><Trash2 className="w-3.5 h-3.5" /></Button>}</div></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ValidationPanel({ slabs, fmt }) {
  const issues = validateSlabs(slabs, fmt);
  if (issues.length === 0) return <div className="flex items-center gap-2 text-emerald-600 text-sm bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-2.5"><CheckCircle2 className="w-4 h-4" /> No conflicts detected.</div>;
  return <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 space-y-1"><div className="flex items-center gap-2 text-amber-700 font-medium text-sm"><AlertTriangle className="w-4 h-4" /> {issues.length} issue(s) found</div>{issues.map((issue, i) => <div key={i} className="text-sm text-amber-600 ml-6">• {issue}</div>)}</div>;
}

export default function IncentiveManagement() {
  const qc = useQueryClient();
  const { format: fmt, code: curCode } = useAppCurrency();
  const { can } = usePermissions();
  const canEditIncentives = can("admin_incentives", "edit");
  const canDeleteIncentives = can("admin_incentives", "delete");
  const canExportIncentives = can("admin_incentives", "export");
  const canImportIncentives = can("admin_incentives", "import");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [activeTab, setActiveTab] = useState('full_time');
  const importRef = useRef();

  const { data: slabs = [], isLoading } = useQuery({ queryKey: ['incentive-slabs'], queryFn: () => db.IncentiveSlab.list() });

  const saveMutation = useMutation({
    mutationFn: (data) => editingId ? db.IncentiveSlab.update(editingId, data) : db.IncentiveSlab.create(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['incentive-slabs'] }); setShowForm(false); setEditingId(null); toast.success("Saved"); }
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => db.IncentiveSlab.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['incentive-slabs'] }); toast.success("Deleted"); }
  });

  const handleEdit = (r) => { setForm({ employee_type: r.employee_type, min_sales: r.min_sales, max_sales: r.max_sales || 0, incentive_percentage: r.incentive_percentage || 0, incentive_fixed: r.incentive_fixed || 0 }); setEditingId(r.id); setShowForm(true); };

  const incentiveExportAoa = () => {
    const header = ["employee_type", "min_sales", "max_sales", "incentive_percentage", "incentive_fixed"];
    const body = slabs.map((s) => [
      s.employee_type,
      s.min_sales,
      s.max_sales ?? "",
      s.incentive_percentage || 0,
      s.incentive_fixed || 0,
    ]);
    return [header, ...body];
  };

  const handleExportCsv = () => {
    const aoa = incentiveExportAoa();
    if (aoa.length <= 1) {
      toast.error("No slabs to export");
      return;
    }
    downloadCsvFromAoa(aoa, "incentive_slabs.csv");
    toast.success("Exported CSV");
  };

  const handleExportExcel = () => {
    const aoa = incentiveExportAoa();
    if (aoa.length <= 1) {
      toast.error("No slabs to export");
      return;
    }
    downloadExcelFromAoa(aoa, { sheetName: "IncentiveSlabs", filename: "incentive_slabs.xlsx" });
    toast.success("Exported Excel");
  };

  const handleImport = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!canImportIncentives) {
      toast.error("You do not have permission to import incentive slabs.");
      e.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const lines = ev.target.result.trim().split('\n');
      const headers = lines[0].split(',').map(h => h.trim());
      const parsed = lines.slice(1).map(line => { const vals = line.split(','); const obj = {}; headers.forEach((h, i) => { obj[h] = vals[i]?.trim(); }); return { employee_type: obj.employee_type, min_sales: Math.round(Number(obj.min_sales) || 0), max_sales: obj.max_sales !== '' ? Math.round(Number(obj.max_sales)) : 0, incentive_percentage: Number(obj.incentive_percentage) || 0, incentive_fixed: Number(obj.incentive_fixed) || 0 }; }).filter(r => r.employee_type === 'full_time' || r.employee_type === 'part_time');
      if (parsed.length === 0) { toast.error("No valid rows found."); return; }
      await Promise.all(slabs.map(s => db.IncentiveSlab.delete(s.id)));
      await db.IncentiveSlab.bulkCreate(parsed);
      qc.invalidateQueries({ queryKey: ['incentive-slabs'] });
      toast.success(`Imported ${parsed.length} slabs`);
      e.target.value = '';
    };
    reader.readAsText(file);
  };

  const fullTimeSlabs = slabs.filter(s => s.employee_type === 'full_time');
  const partTimeSlabs = slabs.filter(s => s.employee_type === 'part_time');

  return (
    <div>
      <PageHeader title="Incentive Management" subtitle="Set incentive slabs for sales/delivery employees" permissionResource="admin_incentives">
        {canExportIncentives && (
        <>
        <Button variant="outline" size="sm" className="gap-1" onClick={handleExportCsv}>
          <FileDown className="w-4 h-4" /> Export CSV
        </Button>
        <Button variant="outline" size="sm" className="gap-1" onClick={handleExportExcel}>
          <FileSpreadsheet className="w-4 h-4" /> Export Excel
        </Button>
        </>
        )}
        <Button variant="outline" size="sm" className="gap-1" disabled={!canImportIncentives} onClick={() => importRef.current?.click()}><Upload className="w-4 h-4" /> Import</Button>
        <input ref={importRef} type="file" accept=".csv" className="hidden" onChange={handleImport} />
        {canEditIncentives && (
        <Button size="sm" className="gap-1" onClick={() => { setForm({ ...emptyForm, employee_type: activeTab }); setEditingId(null); setShowForm(true); }}><Plus className="w-4 h-4" /> Add Slab</Button>
        )}
      </PageHeader>

      {isLoading ? <div className="text-center py-10 text-muted-foreground text-sm">Loading...</div> : (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-4">
            <TabsTrigger value="full_time">Full Time <Badge variant="secondary" className="ml-1 text-xs">{fullTimeSlabs.length}</Badge></TabsTrigger>
            <TabsTrigger value="part_time">Part Time <Badge variant="secondary" className="ml-1 text-xs">{partTimeSlabs.length}</Badge></TabsTrigger>
          </TabsList>
          <TabsContent value="full_time" className="space-y-4"><ValidationPanel slabs={fullTimeSlabs} fmt={fmt} /><SlabTable slabs={fullTimeSlabs} onEdit={handleEdit} onDelete={(id) => deleteMutation.mutate(id)} fmt={fmt} curCode={curCode} canDelete={canDeleteIncentives} /></TabsContent>
          <TabsContent value="part_time" className="space-y-4"><ValidationPanel slabs={partTimeSlabs} fmt={fmt} /><SlabTable slabs={partTimeSlabs} onEdit={handleEdit} onDelete={(id) => deleteMutation.mutate(id)} fmt={fmt} curCode={curCode} canDelete={canDeleteIncentives} /></TabsContent>
        </Tabs>
      )}

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{editingId ? "Edit" : "Add"} Incentive Slab</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-2">
            <div><Label>Employee Type</Label><Select value={form.employee_type} onValueChange={v => setForm({ ...form, employee_type: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="full_time">Full Time</SelectItem><SelectItem value="part_time">Part Time</SelectItem></SelectContent></Select></div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Min Sales ({curCode})</Label><Input type="number" value={form.min_sales} onChange={e => setForm({ ...form, min_sales: Number(e.target.value) })} /></div>
              <div><Label>Max Sales ({curCode}) (0=∞)</Label><Input type="number" value={form.max_sales} onChange={e => setForm({ ...form, max_sales: Number(e.target.value) })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Incentive %</Label><Input type="number" step="0.1" value={form.incentive_percentage} onChange={e => setForm({ ...form, incentive_percentage: Number(e.target.value) })} /></div>
              <div><Label>Fixed Amount ({curCode})</Label><Input type="number" value={form.incentive_fixed} onChange={e => setForm({ ...form, incentive_fixed: Number(e.target.value) })} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button onClick={() => saveMutation.mutate({ ...form, min_sales: Math.round(form.min_sales), max_sales: Math.round(form.max_sales) })} disabled={saveMutation.isPending}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}