import React, { useState, useMemo } from "react";
import { db, uploadFile } from "@/services/SupabaseService";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import PageHeader from "@/components/shared/PageHeader";
import DataTable from "@/components/shared/DataTable";
import ConfirmModal from "@/components/shared/ConfirmModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { useAuth } from "@/lib/AuthContext";
import { sanitizeMojibakeText } from "@/lib/utils";
import { useAppCurrency } from "@/hooks/useAppCurrency";
import { useSoftDelete } from "@/hooks/useSoftDelete";
import { sortStringsForDisplay, sortByLocaleKey } from "@/lib/utils";
import { usePermissions } from "@/hooks/usePermissions";

export default function Expenses() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { can } = usePermissions();
  const canEditExpenses = can("expenses", "edit");
  const canDeleteExpenses = can("expenses", "delete");
  const canUploadReceipts = can("expenses", "upload");
  const { format: fmt, code: curCode } = useAppCurrency();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [confirmAction, setConfirmAction] = useState(null);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [form, setForm] = useState({ date: format(new Date(), 'yyyy-MM-dd'), category: '', sub_category: '', description: '', amount: 0, payment_mode: 'cash', vendor_id: '', vendor_name: '', vendor_bill_numbers: '', receipt_url: '' });

  const { data: expenses = [], isLoading } = useQuery({ queryKey: ['expenses-all'], queryFn: () => db.Expense.list('-created_date', 500) });
  const { data: categories = [] } = useQuery({ queryKey: ['expense-categories'], queryFn: () => db.ExpenseCategory.filter({ status: 'active' }) });

  const filteredExpenses = expenses.filter(e => {
    if (dateFrom && e.date < dateFrom) return false;
    if (dateTo && e.date > dateTo) return false;
    return true;
  });

  const saveMutation = useMutation({
    mutationFn: (data) => {
      data.entry_by = user?.full_name || user?.email || '';
      data.entry_timestamp = new Date().toISOString();
      return editingId ? db.Expense.update(editingId, data) : db.Expense.create(data);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['expenses-all'] }); setShowForm(false); setEditingId(null); toast.success(editingId ? "Updated" : "Expense added"); }
  });

  const softDelete = useSoftDelete({
    entityName: "Expense",
    tableName: "expenses",
    fallbackTableName: "expense",
    getDisplayName: (r) => `${r.category || "Expense"} · ${fmt(r.amount || 0)}`,
    invalidateKeys: [["expenses-all"]],
    onSuccess: () => setSelectedIds([]),
  });

  const handleEdit = (e) => { setForm({ date: e.date || '', category: e.category || '', sub_category: e.sub_category || '', description: e.description || '', amount: e.amount || 0, payment_mode: e.payment_mode || 'cash', vendor_id: e.vendor_id || '', vendor_name: e.vendor_name || '', vendor_bill_numbers: e.vendor_bill_numbers || '', receipt_url: e.receipt_url || '' }); setEditingId(e.id); setShowForm(true); };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const { file_url } = await uploadFile(file);
      setForm((f) => ({ ...f, receipt_url: file_url }));
      toast.success("Receipt uploaded");
    } catch (err) {
      toast.error(err?.message || "Receipt upload failed");
    }
  };

  const parentCategories = useMemo(
    () => sortStringsForDisplay([...new Set(categories.map((c) => c.parent_category))]),
    [categories]
  );

  const columns = [
    { key: 'date', header: 'Date', accessor: 'date', sortable: true },
    { key: 'category', header: 'Category', accessor: 'category', sortable: true },
    { key: 'description', header: 'Description', accessor: 'description', render: (r) => sanitizeMojibakeText(r.description || '') },
    { key: 'amount', header: 'Amount', accessor: 'amount', sortable: true, render: (r) => fmt(r.amount || 0) },
    { key: 'mode', header: 'Mode', render: (r) => <span className="capitalize">{r.payment_mode}</span> },
    { key: 'entry_by', header: 'Entry By', accessor: 'entry_by' },
    { key: 'actions', header: '', render: (r) => (canEditExpenses ? <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); handleEdit(r); }}><Pencil className="w-3.5 h-3.5" /></Button> : null) }
  ];

  return (
    <div>
      <PageHeader title="Expenses" subtitle="Track all business expenses" permissionResource="expenses" exportData={filteredExpenses.map(e => ({ Date: e.date, Category: e.category, Description: sanitizeMojibakeText(e.description || ''), Amount: e.amount || 0, Mode: e.payment_mode, 'Entry By': e.entry_by || '' }))}>
        {canDeleteExpenses && selectedIds.length > 0 && <Button variant="outline" size="sm" className="gap-1 text-destructive" onClick={() => setConfirmAction({ ids: selectedIds })}><Trash2 className="w-3.5 h-3.5" /> Move to Trash ({selectedIds.length})</Button>}
        {canEditExpenses && (
        <Button size="sm" className="gap-1" onClick={() => { setForm({ date: format(new Date(), 'yyyy-MM-dd'), category: '', sub_category: '', description: '', amount: 0, payment_mode: 'cash', vendor_id: '', vendor_name: '', vendor_bill_numbers: '', receipt_url: '' }); setEditingId(null); setShowForm(true); }}><Plus className="w-4 h-4" /> Add Expense</Button>
        )}
      </PageHeader>

      <div className="flex gap-3 mb-4 items-end">
        <div><Label className="text-xs">From</Label><Input type="date" className="h-9 w-40" value={dateFrom} onChange={e => setDateFrom(e.target.value)} /></div>
        <div><Label className="text-xs">To</Label><Input type="date" className="h-9 w-40" value={dateTo} onChange={e => setDateTo(e.target.value)} /></div>
        {(dateFrom || dateTo) && <Button variant="ghost" size="sm" onClick={() => { setDateFrom(''); setDateTo(''); }}>Clear</Button>}
      </div>

      <DataTable columns={columns} data={filteredExpenses} loading={isLoading} selectable={canDeleteExpenses || canEditExpenses} selectedIds={selectedIds} onSelectionChange={setSelectedIds} searchPlaceholder="Search expenses..." />

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editingId ? "Edit" : "Add"} Expense</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Date *</Label><Input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></div>
              <div><Label>Amount ({curCode}) *</Label><Input type="number" value={form.amount} onChange={e => setForm({ ...form, amount: Number(e.target.value) })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Category *</Label>
                <Select value={form.category} onValueChange={v => setForm({ ...form, category: v })}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    {parentCategories.map(pc => (
                      <React.Fragment key={pc}>
                        <SelectItem value={`__h_${pc}`} disabled className="font-bold text-xs">{pc}</SelectItem>
                        {sortByLocaleKey(
                          categories.filter((c) => c.parent_category === pc),
                          "name"
                        ).map((c) => (
                          <SelectItem key={c.id} value={c.name}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </React.Fragment>
                    ))}
                    <SelectItem value="Vendor Payments">Vendor Payments</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Payment Mode</Label>
                <Select value={form.payment_mode} onValueChange={v => setForm({ ...form, payment_mode: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="bank">Bank</SelectItem><SelectItem value="cash">Cash</SelectItem></SelectContent>
                </Select>
              </div>
            </div>
            <div><Label>Description</Label><Input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
            <div>
              <Label>Receipt</Label>
              <div className="flex gap-2 items-center">
                {canUploadReceipts ? (
                  <Input type="file" accept="image/*,.pdf" onChange={handleFileUpload} className="text-xs" />
                ) : (
                  <p className="text-xs text-muted-foreground">Upload disabled for your role.</p>
                )}
                {form.receipt_url && <a href={form.receipt_url} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">View</a>}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button onClick={() => saveMutation.mutate(form)} disabled={!form.date || !form.category || !form.amount}>{editingId ? "Update" : "Add"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmModal open={!!confirmAction} onClose={() => setConfirmAction(null)} onConfirm={() => { softDelete.mutate({ ids: confirmAction.ids, records: expenses.filter((e) => confirmAction.ids.includes(e.id)) }); setConfirmAction(null); }} title="Move to Trash" description={`Move ${confirmAction?.ids?.length || 0} expense(s) to Trash? Restore or permanently delete them from Administration → Trash Bin.`} confirmText="Move to Trash" destructive />
    </div>
  );
}