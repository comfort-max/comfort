import React, { useState, useMemo } from "react";
import { db } from "@/services/SupabaseService";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import PageHeader from "@/components/shared/PageHeader";
import DataTable from "@/components/shared/DataTable";
import StatusBadge from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { sortStringsForDisplay } from "@/lib/utils";
import { usePermissions } from "@/hooks/usePermissions";

const PARENT_CATEGORIES = sortStringsForDisplay([
  "Admin Expenses",
  "Workshop Expenses",
  "Salary Expenses",
  "Incentive Expenses",
  "Leave Encashment",
  "Bonus",
  "Vendor Payments",
]);

export default function ExpenseCategories() {
  const qc = useQueryClient();
  const { can } = usePermissions();
  const canDeleteCategories = can("admin_expense_categories", "delete");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ name: '', parent_category: 'Admin Expenses', status: 'active' });

  const { data: categories = [], isLoading } = useQuery({ queryKey: ['expense-cats'], queryFn: () => db.ExpenseCategory.list() });

  const saveMutation = useMutation({
    mutationFn: (data) => editingId ? db.ExpenseCategory.update(editingId, data) : db.ExpenseCategory.create(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['expense-cats'] }); setShowForm(false); setEditingId(null); toast.success("Saved"); }
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => db.ExpenseCategory.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['expense-cats'] }); toast.success("Deleted"); }
  });

  const columns = useMemo(
    () => [
      { key: "name", header: "Name", accessor: "name", sortable: true },
      { key: "parent", header: "Parent Category", accessor: "parent_category", sortable: true },
      { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} /> },
      {
        key: "actions",
        header: "",
        render: (r) => (
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => {
                setForm({ name: r.name, parent_category: r.parent_category, status: r.status });
                setEditingId(r.id);
                setShowForm(true);
              }}
            >
              <Pencil className="w-3.5 h-3.5" />
            </Button>
            {canDeleteCategories && (
              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteMutation.mutate(r.id)}>
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            )}
          </div>
        ),
      },
    ],
    [canDeleteCategories, deleteMutation]
  );

  return (
    <div>
      <PageHeader title="Expense Categories" subtitle="Manage expense categories">
        <Button size="sm" className="gap-1" onClick={() => { setForm({ name: '', parent_category: 'Admin Expenses', status: 'active' }); setEditingId(null); setShowForm(true); }}><Plus className="w-4 h-4" /> Add Category</Button>
      </PageHeader>
      <DataTable columns={columns} data={[...categories].sort((a, b) => (a.name || '').localeCompare(b.name || ''))} loading={isLoading} />
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{editingId ? "Edit" : "Add"} Category</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-2">
            <div><Label>Name *</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
            <div><Label>Parent Category</Label><Select value={form.parent_category} onValueChange={v => setForm({ ...form, parent_category: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{PARENT_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button><Button onClick={() => saveMutation.mutate(form)} disabled={!form.name}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}