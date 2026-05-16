import React, { useState, useMemo } from "react";
import { db } from "@/services/SupabaseService";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import PageHeader from "@/components/shared/PageHeader";
import DataTable from "@/components/shared/DataTable";
import StatusBadge from "@/components/shared/StatusBadge";
import ConfirmModal from "@/components/shared/ConfirmModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Wand2, DollarSign } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import GenerateSalaryDialog from "@/components/salary/GenerateSalaryDialog";
import { useAuth } from "@/lib/AuthContext";
import { useAppCurrency } from "@/hooks/useAppCurrency";
import { buildStaffWagesExpenseDescription } from "@/lib/salaryStaffWagesExpense";
import { useSoftDelete } from "@/hooks/useSoftDelete";
import { sortByLocaleKey, CALENDAR_MONTH_NAMES } from "@/lib/utils";
import { usePermissions } from "@/hooks/usePermissions";

const MONTHS = CALENDAR_MONTH_NAMES;

export default function Salary() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { can } = usePermissions();
  const canEditSalary = can("salary", "edit");
  const canDeleteSalary = can("salary", "delete");
  const canSalaryGenerate = can("salary", "salary_generate");
  const canSalaryPay = can("salary", "salary_pay");
  const { format: fmt, code: curCode } = useAppCurrency();
  const [showForm, setShowForm] = useState(false);
  const [showGenerate, setShowGenerate] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [confirmAction, setConfirmAction] = useState(null);
  const [paymentDialog, setPaymentDialog] = useState(null);
  const [form, setForm] = useState({ employee_id: '', employee_name: '', month: new Date().getMonth() + 1, year: new Date().getFullYear(), basic_salary: 0, incentive: 0, bonus: 0, deductions: 0, net_salary: 0, payment_status: 'pending', remarks: '' });

  const { data: records = [], isLoading } = useQuery({ queryKey: ['salary-records'], queryFn: () => db.SalaryRecord.list('-created_date', 500) });
  const { data: employees = [] } = useQuery({ queryKey: ['employees-active'], queryFn: () => db.Employee.filter({ status: 'active' }) });
  const employeesSorted = useMemo(() => sortByLocaleKey(employees), [employees]);

  const saveMutation = useMutation({
    mutationFn: (data) => {
      data.entry_by = user?.full_name || user?.email || '';
      data.net_salary = (data.basic_salary || 0) + (data.incentive || 0) + (data.bonus || 0) - (data.deductions || 0);
      return editingId ? db.SalaryRecord.update(editingId, data) : db.SalaryRecord.create(data);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['salary-records'] }); setShowForm(false); setEditingId(null); toast.success("Saved"); }
  });

  const softDelete = useSoftDelete({
    entityName: "SalaryRecord",
    tableName: "salary_records",
    fallbackTableName: "salary_record",
    getDisplayName: (r) => `${r.employee_name || "Employee"} · ${MONTHS[(r.month || 1) - 1]} ${r.year}`,
    invalidateKeys: [["salary-records"]],
    onSuccess: () => setSelectedIds([]),
  });

  const handleDeleteSalaryRecords = (ids) => {
    const recs = records.filter((r) => ids.includes(r.id));
    softDelete.mutate({ ids, records: recs });
  };

  const recordPaymentMutation = useMutation({
    mutationFn: async (data) => {
      const record = records.find(r => r.id === data.recordId);
      if (!record) throw new Error("Record not found");
      await db.SalaryRecord.update(data.recordId, { payment_status: 'paid', payment_date: data.paymentDate });
      await db.Expense.create({
        date: data.paymentDate,
        category: 'Staff Wages',
        description: buildStaffWagesExpenseDescription(record),
        amount: record.net_salary || 0,
        payment_mode: data.method || 'cash',
        entry_by: user?.full_name || user?.email || '',
        entry_timestamp: new Date().toISOString()
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['salary-records'] });
      qc.invalidateQueries({ queryKey: ['expenses-all'] });
      setPaymentDialog(null);
      setSelectedIds([]);
      toast.success("Payment recorded");
    }
  });

  const bulkCreateMutation = useMutation({
    mutationFn: (rows) => {
      const entry_by = user?.full_name || user?.email || '';
      const clean = rows.map(({ _already_exists, sales_amount, employee_type, ...r }) => ({ ...r, entry_by }));
      return db.SalaryRecord.bulkCreate(clean);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['salary-records'] }); setShowGenerate(false); toast.success("Salary sheet generated"); }
  });

  const selectEmployee = (id) => { const e = employees.find(e => e.id === id); setForm(f => ({ ...f, employee_id: id, employee_name: e?.name || '', basic_salary: e?.monthly_salary || 0, net_salary: (e?.monthly_salary || 0) + f.incentive + f.bonus - f.deductions })); };

  const columns = useMemo(
    () => [
      { key: 'employee', header: 'Employee', accessor: 'employee_name', sortable: true },
      { key: 'month', header: 'Month', render: (r) => `${MONTHS[(r.month || 1) - 1]} ${r.year}` },
      { key: 'basic', header: 'Basic', render: (r) => fmt(r.basic_salary || 0) },
      { key: 'incentive', header: 'Incentive', render: (r) => fmt(r.incentive || 0) },
      { key: 'bonus', header: 'Bonus', render: (r) => fmt(r.bonus || 0) },
      { key: 'deductions', header: 'Deductions', render: (r) => fmt(r.deductions || 0) },
      { key: 'net', header: 'Net Salary', sortable: true, render: (r) => <span className="font-semibold">{fmt(r.net_salary || 0)}</span> },
      { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.payment_status} /> },
      { key: 'actions', header: '', render: (r) => (canEditSalary || canSalaryPay) ? (
        <div className="flex gap-1">
          {r.payment_status === 'pending' && canSalaryPay && <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={(e) => { e.stopPropagation(); setPaymentDialog({ recordId: r.id, method: 'cash', paymentDate: format(new Date(), 'yyyy-MM-dd') }); }}><DollarSign className="w-3 h-3" /> Pay</Button>}
          {canEditSalary && <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); setForm({ employee_id: r.employee_id || '', employee_name: r.employee_name || '', month: r.month, year: r.year, basic_salary: r.basic_salary || 0, incentive: r.incentive || 0, bonus: r.bonus || 0, deductions: r.deductions || 0, net_salary: r.net_salary || 0, payment_status: r.payment_status || 'pending', remarks: r.remarks || '' }); setEditingId(r.id); setShowForm(true); }}><Pencil className="w-3.5 h-3.5" /></Button>}
        </div>
      ) : null }
    ],
    [fmt, canEditSalary, canSalaryPay]
  );

  return (
    <div>
      <PageHeader title="Salary" subtitle="Manage employee salary records" permissionResource="salary" exportData={records.map(r => ({ Employee: r.employee_name, Month: MONTHS[(r.month||1)-1], Year: r.year, Basic: r.basic_salary||0, Incentive: r.incentive||0, Bonus: r.bonus||0, Deductions: r.deductions||0, 'Net Salary': r.net_salary||0, Status: r.payment_status }))}>
        {selectedIds.length > 0 && canSalaryPay && <Button size="sm" className="gap-1" onClick={() => setPaymentDialog({ recordIds: selectedIds, method: 'cash', paymentDate: format(new Date(), 'yyyy-MM-dd') })}><DollarSign className="w-3.5 h-3.5" /> Record Payment ({selectedIds.length})</Button>}
        {selectedIds.length > 0 && canDeleteSalary && <Button variant="outline" size="sm" className="gap-1 text-destructive" onClick={() => setConfirmAction({ ids: selectedIds })}><Trash2 className="w-3.5 h-3.5" /> Move to Trash ({selectedIds.length})</Button>}
        {canSalaryGenerate && <Button variant="outline" size="sm" className="gap-2" onClick={() => setShowGenerate(true)}><Wand2 className="w-4 h-4" /> Generate Month Sheet</Button>}
        {canEditSalary && <Button size="sm" className="gap-1" onClick={() => { setForm({ employee_id: '', employee_name: '', month: new Date().getMonth() + 1, year: new Date().getFullYear(), basic_salary: 0, incentive: 0, bonus: 0, deductions: 0, net_salary: 0, payment_status: 'pending', remarks: '' }); setEditingId(null); setShowForm(true); }}><Plus className="w-4 h-4" /> Add Record</Button>}
      </PageHeader>

      <DataTable columns={columns} data={records} loading={isLoading} selectable={canEditSalary || canDeleteSalary || canSalaryPay} selectedIds={selectedIds} onSelectionChange={setSelectedIds} searchPlaceholder="Search salary records..." />

      <Dialog open={showForm && canEditSalary} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editingId ? "Edit" : "Add"} Salary Record</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-2">
            <div><Label>Employee *</Label><Select value={form.employee_id} onValueChange={selectEmployee}><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger><SelectContent>{employeesSorted.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}</SelectContent></Select></div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Month</Label><Select value={String(form.month)} onValueChange={v => setForm({ ...form, month: Number(v) })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{MONTHS.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent></Select></div>
              <div><Label>Year</Label><Input type="number" value={form.year} onChange={e => setForm({ ...form, year: Number(e.target.value) })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Basic Salary ({curCode})</Label><Input type="number" value={form.basic_salary} onChange={e => setForm({ ...form, basic_salary: Number(e.target.value) })} /></div>
              <div><Label>Incentive ({curCode})</Label><Input type="number" value={form.incentive} onChange={e => setForm({ ...form, incentive: Number(e.target.value) })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Bonus ({curCode})</Label><Input type="number" value={form.bonus} onChange={e => setForm({ ...form, bonus: Number(e.target.value) })} /></div>
              <div><Label>Deductions ({curCode})</Label><Input type="number" value={form.deductions} onChange={e => setForm({ ...form, deductions: Number(e.target.value) })} /></div>
            </div>
            <div className="text-right font-bold text-lg">Net: {fmt((form.basic_salary || 0) + (form.incentive || 0) + (form.bonus || 0) - (form.deductions || 0))}</div>
            <div><Label>Payment Status</Label><Select value={form.payment_status} onValueChange={v => setForm({ ...form, payment_status: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="pending">Pending</SelectItem><SelectItem value="paid">Paid</SelectItem></SelectContent></Select></div>
            <div><Label>Remarks</Label><Input value={form.remarks} onChange={e => setForm({ ...form, remarks: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button onClick={() => saveMutation.mutate(form)} disabled={!form.employee_id}>{editingId ? "Update" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmModal open={!!confirmAction} onClose={() => setConfirmAction(null)} onConfirm={() => { handleDeleteSalaryRecords(confirmAction.ids); setConfirmAction(null); }} title="Move to Trash" description={`Move ${confirmAction?.ids?.length || 0} salary record(s) to Trash? You can restore or permanently delete them from Administration → Trash Bin.`} confirmText="Move to Trash" destructive />

      <Dialog open={!!paymentDialog} onOpenChange={() => setPaymentDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Record Payment</DialogTitle></DialogHeader>
          {paymentDialog && (
            <div className="grid gap-4 py-2">
              <div><Label>Payment Date</Label><Input type="date" value={paymentDialog.paymentDate} onChange={e => setPaymentDialog({ ...paymentDialog, paymentDate: e.target.value })} /></div>
              <div><Label>Method</Label><Select value={paymentDialog.method} onValueChange={v => setPaymentDialog({ ...paymentDialog, method: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="bank">Bank</SelectItem><SelectItem value="cash">Cash</SelectItem><SelectItem value="cheque">Cheque</SelectItem></SelectContent></Select></div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentDialog(null)}>Cancel</Button>
            <Button onClick={() => {
              if (!canSalaryPay) return;
              if (paymentDialog.recordIds) paymentDialog.recordIds.forEach(id => recordPaymentMutation.mutate({ recordId: id, method: paymentDialog.method, paymentDate: paymentDialog.paymentDate }));
              else recordPaymentMutation.mutate({ recordId: paymentDialog.recordId, method: paymentDialog.method, paymentDate: paymentDialog.paymentDate });
            }} disabled={recordPaymentMutation.isPending || !canSalaryPay}>Record Payment</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <GenerateSalaryDialog open={showGenerate && canSalaryGenerate} onClose={() => setShowGenerate(false)} existingRecords={records} onGenerate={(toCreate) => bulkCreateMutation.mutate(toCreate)} />
    </div>
  );
}