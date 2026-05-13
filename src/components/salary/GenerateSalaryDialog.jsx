import React, { useState, useMemo } from "react";
import { db } from "@/services/SupabaseService";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle2, Loader2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { useAppCurrency } from "@/hooks/useAppCurrency";
import { CALENDAR_MONTH_NAMES } from "@/lib/utils";

const MONTHS = CALENDAR_MONTH_NAMES;

function calcIncentive(slabs, employeeType, salesAmount) {
  const applicable = slabs
    .filter(s => s.employee_type === employeeType)
    .sort((a, b) => a.min_sales - b.min_sales);
  for (const slab of applicable) {
    const min = slab.min_sales || 0;
    const max = slab.max_sales || Infinity;
    if (salesAmount >= min && salesAmount <= max) {
      if (slab.incentive_percentage) return Math.round((salesAmount * slab.incentive_percentage) / 100);
      if (slab.incentive_fixed) return slab.incentive_fixed;
    }
  }
  return 0;
}

export default function GenerateSalaryDialog({ open, onClose, onGenerate, existingRecords = [] }) {
  const { format: fmt, code: curCode } = useAppCurrency();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [generating, setGenerating] = useState(false);
  const [preview, setPreview] = useState(null);

  const { data: employees = [] } = useQuery({
    queryKey: ['employees-active'],
    queryFn: () => db.Employee.filter({ status: 'active' })
  });

  const { data: slabs = [] } = useQuery({
    queryKey: ['incentive-slabs'],
    queryFn: () => db.IncentiveSlab.list()
  });

  const { data: bills = [] } = useQuery({
    queryKey: ['bills-salary-gen'],
    queryFn: () => db.Bill.list('-created_date', 2000)
  });

  const alreadyExists = useMemo(() =>
    existingRecords.filter(r => r.month === month && r.year === year),
    [existingRecords, month, year]
  );

  const salesByEmployee = useMemo(() => {
    const pad = (n) => String(n).padStart(2, '0');
    const prefix = `${year}-${pad(month)}`;
    const map = {};
    bills.forEach(b => {
      if (b.bill_date && b.bill_date.startsWith(prefix) && b.pickup_employee_name) {
        map[b.pickup_employee_name] = (map[b.pickup_employee_name] || 0) + (b.total_amount || 0);
      }
    });
    return map;
  }, [bills, month, year]);

  const buildPreview = () => {
    const rows = employees.map(emp => {
      const salesAmt = emp.role === 'sales_delivery' ? (salesByEmployee[emp.name] || 0) : 0;
      const incentive = emp.role === 'sales_delivery' ? calcIncentive(slabs, emp.employee_type, salesAmt) : 0;
      const basic = emp.monthly_salary || 0;
      const net = basic + incentive;
      const existsAlready = existingRecords.some(r => r.employee_id === emp.id && r.month === month && r.year === year);
      return {
        employee_id: emp.id,
        employee_name: emp.name,
        employee_type: emp.employee_type,
        month, year,
        basic_salary: basic,
        sales_amount: salesAmt,
        incentive,
        bonus: 0,
        deductions: 0,
        net_salary: net,
        payment_status: 'pending',
        remarks: '',
        _already_exists: existsAlready,
      };
    });
    setPreview(rows);
  };

  const handleGenerate = async () => {
    if (!preview) return;
    const toCreate = preview.filter(r => !r._already_exists);
    if (toCreate.length === 0) { toast.info("All employees already have records for this month."); return; }
    setGenerating(true);
    try { onGenerate(toCreate, preview); } finally { setGenerating(false); }
  };

  const updatePreviewRow = (empId, field, value) => {
    setPreview(prev => prev.map(r => {
      if (r.employee_id !== empId) return r;
      const updated = { ...r, [field]: Number(value) };
      updated.net_salary = (updated.basic_salary || 0) + (updated.incentive || 0) + (updated.bonus || 0) - (updated.deductions || 0);
      return updated;
    }));
  };

  const toCreate = preview ? preview.filter(r => !r._already_exists) : [];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="w-5 h-5 text-primary" /> Auto-Generate Salary Sheet
          </DialogTitle>
        </DialogHeader>
        <div className="flex gap-4 items-end py-2 border-b pb-4">
          <div>
            <Label>Month</Label>
            <Select value={String(month)} onValueChange={v => { setMonth(Number(v)); setPreview(null); }}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>{MONTHS.map((m, i) => <SelectItem key={i} value={String(i+1)}>{m}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Year</Label>
            <Input type="number" className="w-28" value={year} onChange={e => { setYear(Number(e.target.value)); setPreview(null); }} />
          </div>
          <Button variant="outline" onClick={buildPreview} className="gap-2">
            <Wand2 className="w-4 h-4" /> Preview Sheet
          </Button>
          {alreadyExists.length > 0 && (
            <div className="flex items-center gap-1.5 text-amber-600 text-sm">
              <AlertTriangle className="w-4 h-4" />
              {alreadyExists.length} employee(s) already have records this month
            </div>
          )}
        </div>
        {preview && (
          <div className="space-y-3 mt-2">
            <div className="text-xs text-muted-foreground">Pre-filled from profiles & incentive slabs. Edit before saving.</div>
            <div className="border rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50 border-b text-xs text-muted-foreground">
                      <th className="text-left px-3 py-2">Employee</th>
                      <th className="text-left px-3 py-2">Type</th>
                      <th className="text-right px-3 py-2">Sales ({curCode})</th>
                      <th className="text-right px-3 py-2">Basic ({curCode})</th>
                      <th className="text-right px-3 py-2">Incentive ({curCode})</th>
                      <th className="text-right px-3 py-2">Bonus ({curCode})</th>
                      <th className="text-right px-3 py-2">Deductions ({curCode})</th>
                      <th className="text-right px-3 py-2 font-semibold">Net ({curCode})</th>
                      <th className="text-left px-3 py-2">Remarks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map(row => (
                      <tr key={row.employee_id} className={`border-b last:border-0 ${row._already_exists ? 'opacity-40 bg-muted/30' : 'hover:bg-muted/20'}`}>
                        <td className="px-3 py-2 font-medium">
                          {row.employee_name}
                          {row._already_exists && <Badge variant="outline" className="ml-1 text-[10px] py-0 px-1">exists</Badge>}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground capitalize">{row.employee_type?.replace('_', ' ')}</td>
                        <td className="px-3 py-2 text-right text-muted-foreground">{fmt(row.sales_amount || 0)}</td>
                        <td className="px-3 py-2"><Input type="number" className="h-7 w-24 text-xs text-right" value={row.basic_salary} disabled={row._already_exists} onChange={e => updatePreviewRow(row.employee_id, 'basic_salary', e.target.value)} /></td>
                        <td className="px-3 py-2"><Input type="number" className="h-7 w-24 text-xs text-right" value={row.incentive} disabled={row._already_exists} onChange={e => updatePreviewRow(row.employee_id, 'incentive', e.target.value)} /></td>
                        <td className="px-3 py-2"><Input type="number" className="h-7 w-24 text-xs text-right" value={row.bonus} disabled={row._already_exists} onChange={e => updatePreviewRow(row.employee_id, 'bonus', e.target.value)} /></td>
                        <td className="px-3 py-2"><Input type="number" className="h-7 w-24 text-xs text-right" value={row.deductions} disabled={row._already_exists} onChange={e => updatePreviewRow(row.employee_id, 'deductions', e.target.value)} /></td>
                        <td className="px-3 py-2 text-right font-semibold text-primary">{fmt(row.net_salary || 0)}</td>
                        <td className="px-3 py-2"><Input className="h-7 w-28 text-xs" value={row.remarks} disabled={row._already_exists} onChange={e => setPreview(prev => prev.map(r => r.employee_id === row.employee_id ? {...r, remarks: e.target.value} : r))} /></td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t bg-primary/5 font-semibold text-sm">
                      <td colSpan={3} className="px-3 py-2.5 text-right">Totals ({toCreate.length} new records)</td>
                      <td className="px-3 py-2.5 text-right">{fmt(toCreate.reduce((s,r) => s+r.basic_salary,0))}</td>
                      <td className="px-3 py-2.5 text-right">{fmt(toCreate.reduce((s,r) => s+r.incentive,0))}</td>
                      <td className="px-3 py-2.5 text-right">{fmt(toCreate.reduce((s,r) => s+r.bonus,0))}</td>
                      <td className="px-3 py-2.5 text-right">{fmt(toCreate.reduce((s,r) => s+r.deductions,0))}</td>
                      <td className="px-3 py-2.5 text-right text-primary">{fmt(toCreate.reduce((s,r) => s+r.net_salary,0))}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
            {toCreate.length === 0 && (
              <div className="flex items-center gap-2 text-emerald-600 text-sm bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-2.5">
                <CheckCircle2 className="w-4 h-4" /> All employees already have salary records for this month.
              </div>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          {preview && toCreate.length > 0 && (
            <Button onClick={handleGenerate} disabled={generating} className="gap-2">
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Save {toCreate.length} Records
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}