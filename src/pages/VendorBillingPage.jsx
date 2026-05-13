import React, { useState, useMemo } from "react";
import { db } from "@/services/SupabaseService";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import PageHeader from "@/components/shared/PageHeader";
import DataTable from "@/components/shared/DataTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, CreditCard, Trash2 } from "lucide-react";
import ConfirmModal from "@/components/shared/ConfirmModal";
import ProgressModal from "@/components/shared/ProgressModal";
import { useSoftDelete } from "@/hooks/useSoftDelete";
import { toast } from "sonner";
import { format } from "date-fns";
import FileUploadButton from "@/components/shared/FileUploadButton";
import { useAuth } from "@/lib/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { formatPeriodForExport, normalizeFinancialYearRule } from "@/lib/financialYear";
import { formatCurrencyAmount, getCurrencyConfig } from "@/lib/currency";
import { usePaymentMethodsQuery } from "@/hooks/usePaymentMethodsQuery";
import { buildPaymentMethodClassifier } from "@/lib/paymentMethodChannel";
import { sortByLocaleKey } from "@/lib/utils";
import { activePaymentMethodsSorted, defaultPaymentMethodName as pickDefaultPaymentMethod, paymentMethodSelectValue } from "@/lib/paymentMethodUi";
import { computeVendorBillingPaymentState, vendorBillingSignedDue } from "@/lib/paymentBalance";

export default function VendorBillingPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { can, isAdmin } = usePermissions();
  const canDeleteVendorBilling = can("vendor_billing", "delete");
  const canEditVendorBilling = can("vendor_billing", "edit");
  const canVendorPayment = can("vendor_billing", "vendor_payment");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [paymentDialog, setPaymentDialog] = useState(null);
  const [bulkPaymentDialog, setBulkPaymentDialog] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [confirmTrash, setConfirmTrash] = useState(null);
  const [trashProgress, setTrashProgress] = useState({ open: false, current: 0, total: 0 });
  const [form, setForm] = useState({ date: format(new Date(), 'yyyy-MM-dd'), vendor_id: '', vendor_name: '', order_number: '', bill_numbers: '', amount: 0, payment_method: '', receipt_url: '', payment_proof_url: '', remarks: '', payment_status: 'pending', amount_paid: 0 });

  const { data: billings = [], isLoading } = useQuery({ queryKey: ['vendor-billings'], queryFn: () => db.VendorBilling.list('-created_date', 500) });
  const { data: vendors = [] } = useQuery({ queryKey: ['vendors-active'], queryFn: () => db.Vendor.filter({ status: 'active' }) });
  const { data: employees = [] } = useQuery({ queryKey: ['employees-active'], queryFn: () => db.Employee.filter({ status: 'active' }) });
  const { data: companySettings = [] } = useQuery({ queryKey: ['company-settings'], queryFn: () => db.CompanySettings.list() });

  const { data: paymentMethods } = usePaymentMethodsQuery();
  const paymentMethodsList = paymentMethods ?? [];

  const sortedPaymentMethods = useMemo(
    () => activePaymentMethodsSorted(paymentMethodsList),
    [paymentMethodsList]
  );
  const defaultVendorPaymentMethod = useMemo(() => pickDefaultPaymentMethod(paymentMethodsList), [paymentMethodsList]);

  const methodClassifier = useMemo(() => buildPaymentMethodClassifier(paymentMethodsList), [paymentMethodsList]);

  const vendorsSorted = useMemo(() => sortByLocaleKey(vendors), [vendors]);
  const employeesSorted = useMemo(() => sortByLocaleKey(employees), [employees]);

  const fyRule = useMemo(() => normalizeFinancialYearRule(companySettings[0]), [companySettings]);
  const curCode = getCurrencyConfig(companySettings[0]).code;

  const filtered = billings.filter(b => { if (dateFrom && b.date < dateFrom) return false; if (dateTo && b.date > dateTo) return false; return true; });

  const headerSelectPool = useMemo(
    () => (isAdmin ? filtered : filtered.filter((b) => b.payment_status !== "paid" && b.payment_status !== "overpaid")),
    [isAdmin, filtered]
  );

  const vendorBillingSoftDelete = useSoftDelete({
    entityName: "VendorBilling",
    tableName: "vendor_billings",
    fallbackTableName: "vendor_billing",
    getDisplayName: (r) => `${r.vendor_name || "Vendor"} — ${r.bill_numbers || r.order_number || ""}`,
    invalidateKeys: [["vendor-billings"], ["trash"]],
  });

  const saveMutation = useMutation({
    mutationFn: (data) => {
      data.entry_by = user?.full_name || user?.email || '';
      data.entry_timestamp = new Date().toISOString();
      return editingId ? db.VendorBilling.update(editingId, data) : db.VendorBilling.create(data);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['vendor-billings'] }); setShowForm(false); setEditingId(null); toast.success(editingId ? "Updated" : "Vendor billing entry created"); }
  });

  const recordPaymentMutation = useMutation({
    mutationFn: async (data) => {
      if (!String(data.method || "").trim()) throw new Error("Payment method is required");
      const billing = billings.find(b => b.id === data.billingId);
      if (!billing) throw new Error("Billing record not found");
      const newAmountPaid = (billing.amount_paid || 0) + data.paymentAmount;
      const { payment_status: paymentStatus } = computeVendorBillingPaymentState(billing.amount, newAmountPaid);
      await db.VendorBilling.update(data.billingId, { payment_method: data.method, amount_paid: newAmountPaid, payment_status: paymentStatus, paid_by: data.paid_by, payment_date: data.date });
      await db.Expense.create({ date: data.date, category: 'Vendor Payments', description: `${billing.vendor_name} — Bill #${billing.bill_numbers || billing.order_number || ''}`, amount: data.paymentAmount, payment_mode: methodClassifier.isBank(data.method) ? 'bank' : 'cash', vendor_id: billing.vendor_id, vendor_name: billing.vendor_name, vendor_bill_numbers: billing.bill_numbers || '', entry_by: user?.full_name || user?.email || '', entry_timestamp: new Date().toISOString() });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['vendor-billings'] }); qc.invalidateQueries({ queryKey: ['expenses-all'] }); setPaymentDialog(null); toast.success("Payment recorded & expense entry created"); }
  });

  const handleEdit = (b) => { setForm({ date: b.date || '', vendor_id: b.vendor_id || '', vendor_name: b.vendor_name || '', order_number: b.order_number || '', bill_numbers: b.bill_numbers || '', amount: b.amount || 0, payment_method: b.payment_method || defaultVendorPaymentMethod, receipt_url: b.receipt_url || '', payment_proof_url: b.payment_proof_url || '', remarks: b.remarks || '', payment_status: b.payment_status || 'pending', amount_paid: b.amount_paid || 0 }); setEditingId(b.id); setShowForm(true); };
  const selectVendor = (id) => { const v = vendors.find(v => v.id === id); setForm(f => ({ ...f, vendor_id: id, vendor_name: v?.name || '' })); };

  const paymentStatusBadge = (r) => {
    const status = r.payment_status || "pending";
    const colors = {
      pending: "bg-amber-50 text-amber-700 border-amber-200",
      partial: "bg-orange-50 text-orange-600 border-orange-200",
      paid: "bg-emerald-50 text-emerald-700 border-emerald-200",
      overpaid: "bg-cyan-50 text-cyan-800 border-cyan-200",
    };
    const labels = { pending: "Pending", partial: "Partial", paid: "Paid", overpaid: "Overpaid" };
    return (
      <Badge variant="outline" className={`text-[10px] ${colors[status] || ""}`}>
        {labels[status] || status}
      </Badge>
    );
  };

  const allSelected =
    headerSelectPool.length > 0 && headerSelectPool.every((b) => selectedIds.includes(b.id));

  const columns = [
    { key: 'select', header: <input type="checkbox" checked={allSelected} onChange={() => { if (allSelected) setSelectedIds([]); else setSelectedIds(headerSelectPool.map(b => b.id)); }} />, render: (r) => <input type="checkbox" checked={selectedIds.includes(r.id)} onChange={() => setSelectedIds(prev => prev.includes(r.id) ? prev.filter(id => id !== r.id) : [...prev, r.id])} /> },
    { key: 'date', header: 'Date', accessor: 'date', sortable: true },
    { key: 'vendor', header: 'Vendor', accessor: 'vendor_name', sortable: true },
    { key: 'bills', header: 'Bill #s', accessor: 'bill_numbers' },
    { key: 'amount', header: 'Total Amt', accessor: 'amount', sortable: true, render: (r) => formatCurrencyAmount(r.amount || 0, companySettings[0]) },
    { key: 'amount_paid', header: 'Paid', render: (r) => formatCurrencyAmount(r.amount_paid || 0, companySettings[0]) },
    { key: 'amount_due', header: 'Due', render: (r) => {
      const due = vendorBillingSignedDue(r);
      return (
        <span className={due > 0 ? "text-amber-600 font-medium" : due < 0 ? "text-sky-700 font-medium" : ""}>
          {formatCurrencyAmount(due, companySettings[0])}
        </span>
      );
    }},
    { key: 'payment_status', header: 'Status', render: paymentStatusBadge },
    { key: 'remarks', header: 'Remarks', accessor: 'remarks' },
    ...(companySettings[0]?.enable_vendor_payment_proof ? [{ key: 'payment_proof', header: 'Payment Proof', render: (r) => r.payment_proof_url ? <a href={r.payment_proof_url} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">View</a> : '-' }] : []),
    { key: 'actions', header: '', render: (r) => (
      <div className="flex gap-1">
        {r.payment_status !== 'paid' && r.payment_status !== 'overpaid' && canVendorPayment && <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={(e) => { e.stopPropagation(); const due = vendorBillingSignedDue(r); setPaymentDialog({ billingId: r.id, vendorName: r.vendor_name, totalAmount: r.amount, amountPaid: r.amount_paid || 0, paymentAmount: Math.max(due, 0), method: defaultVendorPaymentMethod, paid_by: '', date: format(new Date(), 'yyyy-MM-dd') }); }}><CreditCard className="w-3 h-3" /> Pay</Button>}
        {canEditVendorBilling && <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); handleEdit(r); }}><Pencil className="w-3.5 h-3.5" /></Button>}
      </div>
    )}
  ];

  const totalDue = filtered.reduce((s, b) => s + Math.max(vendorBillingSignedDue(b), 0), 0);
  const totalVendorCredit = filtered.reduce((s, b) => s + Math.max(-vendorBillingSignedDue(b), 0), 0);

  const bulkRecordPaymentMutation = useMutation({
    mutationFn: async (data) => {
      if (!String(data.method || "").trim()) throw new Error("Payment method is required");
      const { billingIds, method, paid_by, date, amounts } = data;
      await Promise.all(billingIds.map(async (id) => {
        const billing = billings.find(b => b.id === id);
        if (!billing) return;
        const paymentAmount = amounts[id] || 0;
        const newAmountPaid = (billing.amount_paid || 0) + paymentAmount;
        const { payment_status: paymentStatus } = computeVendorBillingPaymentState(billing.amount, newAmountPaid);
        await db.VendorBilling.update(id, { payment_method: method, amount_paid: newAmountPaid, payment_status: paymentStatus, paid_by, payment_date: date });
        await db.Expense.create({ date, category: 'Vendor Payments', description: `${billing.vendor_name} — Bill #${billing.bill_numbers || billing.order_number || ''}`, amount: paymentAmount, payment_mode: methodClassifier.isBank(method) ? 'bank' : 'cash', vendor_id: billing.vendor_id, vendor_name: billing.vendor_name, vendor_bill_numbers: billing.bill_numbers || '', entry_by: user?.full_name || user?.email || '', entry_timestamp: new Date().toISOString() });
      }));
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['vendor-billings'] }); qc.invalidateQueries({ queryKey: ['expenses-all'] }); setBulkPaymentDialog(null); setSelectedIds([]); toast.success("Bulk payment recorded"); }
  });

  return (
    <div>
      <PageHeader title="Vendor Billing" subtitle="Manage vendor payments" permissionResource="vendor_billing" dateRange={formatPeriodForExport(dateFrom, dateTo, fyRule)} exportData={filtered.map(b => ({ Date: b.date, Vendor: b.vendor_name, 'Bill #s': b.bill_numbers||'', 'Total Amount': b.amount||0, Paid: b.amount_paid||0, Due: vendorBillingSignedDue(b), Status: b.payment_status, Remarks: b.remarks||'' }))}>
        {selectedIds.length > 0 && canVendorPayment && <Button size="sm" className="gap-1 bg-emerald-600 hover:bg-emerald-700" onClick={() => { const items = filtered.filter(b => selectedIds.includes(b.id) && b.payment_status !== 'paid' && b.payment_status !== 'overpaid'); if (items.length === 0) { toast.error("No unpaid items selected"); return; } const amounts = {}; items.forEach(i => { amounts[i.id] = Math.max(vendorBillingSignedDue(i), 0); }); setBulkPaymentDialog({ billingIds: items.map(i => i.id), items, method: defaultVendorPaymentMethod, paid_by: '', date: format(new Date(), 'yyyy-MM-dd'), amounts }); }}><CreditCard className="w-4 h-4" /> Record Payment ({selectedIds.length})</Button>}
        {canDeleteVendorBilling && selectedIds.length > 0 && (
          <Button variant="outline" size="sm" className="gap-1 text-destructive" onClick={() => setConfirmTrash({ ids: selectedIds })}>
            <Trash2 className="w-3.5 h-3.5" /> Move to Trash ({selectedIds.length})
          </Button>
        )}
        {canEditVendorBilling && <Button size="sm" className="gap-1" onClick={() => { setForm({ date: format(new Date(), 'yyyy-MM-dd'), vendor_id: '', vendor_name: '', order_number: '', bill_numbers: '', amount: 0, payment_method: defaultVendorPaymentMethod, receipt_url: '', payment_proof_url: '', remarks: '', payment_status: 'pending', amount_paid: 0 }); setEditingId(null); setShowForm(true); }}><Plus className="w-4 h-4" /> Add Entry</Button>}
      </PageHeader>

      <div className="flex gap-3 mb-4 items-end flex-wrap">
        <div><Label className="text-xs">From</Label><Input type="date" className="h-9 w-40" value={dateFrom} onChange={e => setDateFrom(e.target.value)} /></div>
        <div><Label className="text-xs">To</Label><Input type="date" className="h-9 w-40" value={dateTo} onChange={e => setDateTo(e.target.value)} /></div>
        {(totalDue > 0 || totalVendorCredit > 0) && (
          <div className="ml-auto flex flex-wrap gap-x-4 gap-y-1 text-sm justify-end">
            {totalDue > 0 && <span className="font-semibold text-destructive">Total Due: {formatCurrencyAmount(totalDue, companySettings[0])}</span>}
            {totalVendorCredit > 0 && (
              <span className="font-semibold text-sky-700">Vendor credits (overpaid): {formatCurrencyAmount(totalVendorCredit, companySettings[0])}</span>
            )}
          </div>
        )}
      </div>

      <DataTable columns={columns} data={filtered} loading={isLoading} searchPlaceholder="Search vendor billings..." />

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editingId ? "Edit" : "Add"} Vendor Billing Entry</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Date *</Label><Input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></div>
              <div><Label>Vendor *</Label><Select value={form.vendor_id} onValueChange={selectVendor}><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger><SelectContent>{vendorsSorted.map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}</SelectContent></Select></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Amount ({curCode}) *</Label><Input type="number" value={form.amount} onChange={e => setForm({ ...form, amount: Number(e.target.value) })} /></div>
              <div><Label>Bill Numbers</Label><Input value={form.bill_numbers} onChange={e => setForm({ ...form, bill_numbers: e.target.value })} placeholder="e.g. 5890, 5891" /></div>
            </div>
            {companySettings[0]?.enable_vendor_payment_proof && <div><Label>Payment Proof</Label><FileUploadButton fileUrl={form.payment_proof_url} onFileUpload={(url) => setForm({ ...form, payment_proof_url: url })} onFileDelete={() => setForm({ ...form, payment_proof_url: '' })} label="Upload Proof" /></div>}
            <div><Label>Remarks</Label><Input value={form.remarks} onChange={e => setForm({ ...form, remarks: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button onClick={() => saveMutation.mutate(form)} disabled={!form.date || !form.vendor_id || !form.amount || saveMutation.isPending}>{editingId ? "Update" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {paymentDialog && (
        <Dialog open onOpenChange={() => setPaymentDialog(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Record Payment — {paymentDialog.vendorName}</DialogTitle></DialogHeader>
            <div className="grid gap-4 py-2">
              <div className="bg-muted/40 rounded-lg p-3 text-sm space-y-1">
                <div className="flex justify-between"><span className="text-muted-foreground">Total Invoice</span><span className="font-medium">{formatCurrencyAmount(paymentDialog.totalAmount || 0, companySettings[0])}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Already Paid</span><span>{formatCurrencyAmount(paymentDialog.amountPaid || 0, companySettings[0])}</span></div>
                {(() => {
                  const bal = (paymentDialog.totalAmount || 0) - (paymentDialog.amountPaid || 0);
                  const isCredit = bal < 0;
                  return (
                    <div className={`flex justify-between font-semibold ${isCredit ? "text-sky-700" : "text-destructive"}`}>
                      <span>{isCredit ? "Credit (overpaid)" : "Balance Due"}</span>
                      <span>{formatCurrencyAmount(bal, companySettings[0])}</span>
                    </div>
                  );
                })()}
              </div>
              <div><Label>Payment Amount ({curCode})</Label><Input type="number" value={paymentDialog.paymentAmount} onChange={e => setPaymentDialog(p => ({ ...p, paymentAmount: Number(e.target.value) }))} /></div>
              <div><Label>Date</Label><Input type="date" value={paymentDialog.date} onChange={e => setPaymentDialog(p => ({ ...p, date: e.target.value }))} /></div>
              <div><Label>Payment method *</Label><Select value={paymentMethodSelectValue(paymentDialog.method, sortedPaymentMethods, defaultVendorPaymentMethod)} onValueChange={v => setPaymentDialog(p => ({ ...p, method: v }))}><SelectTrigger><SelectValue placeholder={sortedPaymentMethods.length ? "Select method" : "Configure in Company Settings"} /></SelectTrigger><SelectContent>{sortedPaymentMethods.map(m => <SelectItem key={m.id} value={m.name}>{m.name}</SelectItem>)}</SelectContent></Select></div>
              <div><Label>Paid By</Label><Select value={paymentDialog.paid_by} onValueChange={v => setPaymentDialog(p => ({ ...p, paid_by: v }))}><SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger><SelectContent>{employeesSorted.map(e => <SelectItem key={e.id} value={e.name}>{e.name}</SelectItem>)}</SelectContent></Select></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPaymentDialog(null)}>Cancel</Button>
              <Button onClick={() => recordPaymentMutation.mutate(paymentDialog)} disabled={sortedPaymentMethods.length === 0 || !paymentDialog.paymentAmount || !String(paymentDialog.method || '').trim() || !paymentDialog.paid_by || recordPaymentMutation.isPending}>Record Payment</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      <ConfirmModal
        open={!!confirmTrash}
        onClose={() => setConfirmTrash(null)}
        onConfirm={() => {
          if (!confirmTrash?.ids?.length) return;
          const ids = confirmTrash.ids;
          const records = billings.filter((b) => ids.includes(b.id));
          setTrashProgress({ open: true, current: 0, total: ids.length });
          vendorBillingSoftDelete.mutate(
            { ids, records, onProgress: (cur, tot) => setTrashProgress({ open: true, current: cur, total: tot }) },
            {
              onSettled: () => {
                setTrashProgress({ open: false, current: 0, total: 0 });
              },
              onSuccess: () => {
                setConfirmTrash(null);
                setSelectedIds([]);
              },
              onError: () => {
                setConfirmTrash(null);
              },
            }
          );
        }}
        title="Move vendor billing to Trash?"
        description={`Move ${confirmTrash?.ids?.length || 0} vendor billing row(s) to Trash? Restore from Administration → Trash Bin.`}
        confirmText="Move to Trash"
        destructive
      />
      <ProgressModal open={trashProgress.open} current={trashProgress.current} total={trashProgress.total} title="Moving to Trash…" />

      {bulkPaymentDialog && (
        <Dialog open onOpenChange={() => setBulkPaymentDialog(null)}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Record Bulk Payment — {bulkPaymentDialog.items.length} vendors</DialogTitle></DialogHeader>
            <div className="space-y-4 py-2">
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead><tr className="bg-muted/50 border-b text-xs text-muted-foreground"><th className="text-left px-3 py-2">Vendor</th><th className="text-left px-3 py-2">Bill #s</th><th className="text-right px-3 py-2">Due</th><th className="text-right px-3 py-2 w-32">Payment ({curCode})</th></tr></thead>
                  <tbody>
                    {bulkPaymentDialog.items.map(item => (
                      <tr key={item.id} className="border-b last:border-0">
                        <td className="px-3 py-2 font-medium">{item.vendor_name}</td>
                        <td className="px-3 py-2 text-muted-foreground">{item.bill_numbers || '-'}</td>
                        <td className="px-3 py-2 text-right">{formatCurrencyAmount(vendorBillingSignedDue(item), companySettings[0])}</td>
                        <td className="px-3 py-2"><Input type="number" className="h-7 text-xs text-right w-28" value={bulkPaymentDialog.amounts[item.id] || 0} onChange={e => setBulkPaymentDialog(prev => ({ ...prev, amounts: { ...prev.amounts, [item.id]: Number(e.target.value) } }))} /></td>
                      </tr>
                    ))}
                    <tr className="bg-primary/5 font-semibold border-t-2"><td colSpan={3} className="px-3 py-2.5 text-right text-sm">Total</td><td className="px-3 py-2.5 text-right text-sm">{formatCurrencyAmount(Object.values(bulkPaymentDialog.amounts).reduce((s, v) => s + (v || 0), 0), companySettings[0])}</td></tr>
                  </tbody>
                </table>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div><Label>Date</Label><Input type="date" value={bulkPaymentDialog.date} onChange={e => setBulkPaymentDialog(prev => ({ ...prev, date: e.target.value }))} /></div>
                <div><Label>Payment method *</Label><Select value={paymentMethodSelectValue(bulkPaymentDialog.method, sortedPaymentMethods, defaultVendorPaymentMethod)} onValueChange={v => setBulkPaymentDialog(prev => ({ ...prev, method: v }))}><SelectTrigger><SelectValue placeholder={sortedPaymentMethods.length ? "Select method" : "Configure in Company Settings"} /></SelectTrigger><SelectContent>{sortedPaymentMethods.map(m => <SelectItem key={m.id} value={m.name}>{m.name}</SelectItem>)}</SelectContent></Select></div>
                <div><Label>Paid By</Label><Select value={bulkPaymentDialog.paid_by} onValueChange={v => setBulkPaymentDialog(prev => ({ ...prev, paid_by: v }))}><SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger><SelectContent>{employeesSorted.map(e => <SelectItem key={e.id} value={e.name}>{e.name}</SelectItem>)}</SelectContent></Select></div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setBulkPaymentDialog(null)}>Cancel</Button>
              <Button onClick={() => bulkRecordPaymentMutation.mutate(bulkPaymentDialog)} disabled={sortedPaymentMethods.length === 0 || !String(bulkPaymentDialog.method || '').trim() || !bulkPaymentDialog.paid_by || !Object.values(bulkPaymentDialog.amounts).some(v => v > 0) || bulkRecordPaymentMutation.isPending}>Record Payment</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}