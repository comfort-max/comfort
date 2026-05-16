import React, { useState, useMemo } from "react";
import { db } from "@/services/SupabaseService";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import PageHeader from "@/components/shared/PageHeader";
import DataTable from "@/components/shared/DataTable";
import StatusBadge from "@/components/shared/StatusBadge";
import ConfirmModal from "@/components/shared/ConfirmModal";
import ProgressModal from "@/components/shared/ProgressModal";
import PhoneInput from "@/components/shared/PhoneInput";
import { useSoftDelete } from "@/hooks/useSoftDelete";
import { deleteCustomerCascade } from "@/hooks/useCascadeDelete";
import { formatCurrencyAmount } from "@/lib/currency";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Pencil, UserMinus, UserCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { sortStringsForDisplay } from "@/lib/utils";
import { usePermissions } from "@/hooks/usePermissions";

const emptyForm = { name: "", phone: "", email: "", address: "", location: "", notes: "" };

export default function Customers() {
  const qc = useQueryClient();
  const { can } = usePermissions();
  const canEditCustomers = can("customers", "edit");
  const canDeleteCustomers = can("customers", "delete");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [selectedIds, setSelectedIds] = useState([]);
  const [confirmAction, setConfirmAction] = useState(null);
  const [progress, setProgress] = useState({ open: false, current: 0, total: 0 });

  const { data: customers = [], isLoading } = useQuery({
    queryKey: ["customers-all"],
    queryFn: () => db.Customer.list("-created_date", 500)
  });

  const { data: billsForLedger = [] } = useQuery({
    queryKey: ["bills-customer-ledger"],
    queryFn: () => db.Bill.list("-created_date", 2000),
  });

  const { data: companySettings = [] } = useQuery({
    queryKey: ["company-settings"],
    queryFn: () => db.CompanySettings.list(),
  });

  const settingsRow = companySettings[0];

  const existingLocations = useMemo(
    () => sortStringsForDisplay([...new Set(customers.map((c) => c.location).filter(Boolean))]),
    [customers]
  );

  const customerCreditById = useMemo(() => {
    const m = {};
    for (const b of billsForLedger) {
      const cid = b.customer_id;
      if (!cid) continue;
      const due = Number(b.amount_due) || 0;
      if (due >= 0) continue;
      m[cid] = (m[cid] || 0) + -due;
    }
    return m;
  }, [billsForLedger]);

  const saveMutation = useMutation({
    mutationFn: (data) => {
      if (!data.name?.trim()) throw new Error("Name is required");
      if (!data.location?.trim()) throw new Error("Area/Locality is required");
      return editingId ? db.Customer.update(editingId, data) : db.Customer.create(data);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customers-all"] });
      setShowForm(false);
      setEditingId(null);
      setForm(emptyForm);
      toast.success(editingId ? "Customer updated" : "Customer added");
    },
    onError: (error) => {
      toast.error(error?.message || "Failed to save customer");
    }
  });

  const statusMutation = useMutation({
    mutationFn: ({ ids, status }) => Promise.all(ids.map((id) => db.Customer.update(id, { status }))),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customers-all"] });
      setSelectedIds([]);
      toast.success("Status updated");
    }
  });

  const softDelete = useSoftDelete({
    entityName: "Customer",
    tableName: "customers",
    fallbackTableName: "customer",
    getDisplayName: (r) => r.name,
    invalidateKeys: [["customers-all"]],
    onSuccess: () => setSelectedIds([])
  });

  const handleDelete = async (ids) => {
    const records = customers.filter((c) => ids.includes(c.id));
    setProgress({ open: true, current: 0, total: ids.length });
    try {
      await softDelete.mutateAsync({
        ids,
        records,
        onProgress: (cur, tot) => setProgress({ open: true, current: cur, total: tot }),
      });
      await Promise.all(ids.map((id) => deleteCustomerCascade(id)));
      qc.invalidateQueries({ queryKey: ["expenses-all"] });
      qc.invalidateQueries({ queryKey: ["bills-delivery"] });
      qc.invalidateQueries({ queryKey: ["bill-items"] });
      qc.invalidateQueries({ queryKey: ["bills-customer-ledger"] });
    } catch (err) {
      toast.error(err?.message || "Delete failed");
    } finally {
      setProgress({ open: false, current: 0, total: 0 });
    }
  };

  const handleEdit = (c) => {
    setForm({
      name: c.name || "",
      phone: c.phone || "",
      email: c.email || "",
      address: c.address || "",
      location: c.location || "",
      notes: c.notes || ""
    });
    setEditingId(c.id);
    setShowForm(true);
  };

  const columns = [
    { key: "name", header: "Name", accessor: "name", sortable: true },
    { key: "phone", header: "Phone", accessor: "phone", sortable: true },
    { key: "email", header: "Email", accessor: "email" },
    { key: "location", header: "Area/Locality", accessor: "location", sortable: true },
    {
      key: "advance_credit",
      header: "Advance / credit",
      sortable: true,
      accessor: (r) => customerCreditById[r.id] || 0,
      render: (r) => {
        const c = customerCreditById[r.id] || 0;
        if (!c) return <span className="text-muted-foreground">—</span>;
        return <span className="text-sky-700 font-medium">{formatCurrencyAmount(c, settingsRow)}</span>;
      },
    },
    { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status || "active"} /> },
    {
      key: "actions",
      header: "",
      render: (r) =>
        canEditCustomers ? (
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); handleEdit(r); }}>
            <Pencil className="w-3.5 h-3.5" />
          </Button>
        ) : null,
    }
  ];

  return (
    <div>
      <PageHeader
        title="Customers"
        subtitle="Manage customer database"
        permissionResource="customers"
        exportData={customers.map((c) => ({
          Name: c.name,
          Phone: c.phone || "",
          Email: c.email || "",
          "Area/Locality": c.location || "",
          Address: c.address || "",
          "Advance / credit": customerCreditById[c.id]
            ? formatCurrencyAmount(customerCreditById[c.id], settingsRow)
            : "",
          Status: c.status || ""
        }))}
      >
        {selectedIds.length > 0 && (
          <>
            {canEditCustomers && (
              <Button variant="outline" size="sm" className="gap-1 text-emerald-600"
                onClick={() => statusMutation.mutate({ ids: selectedIds, status: "active" })}>
                <UserCheck className="w-3.5 h-3.5" /> Activate
              </Button>
            )}

            {canEditCustomers && (
              <Button variant="outline" size="sm" className="gap-1 text-amber-600"
                onClick={() => statusMutation.mutate({ ids: selectedIds, status: "deactivated" })}>
                <UserMinus className="w-3.5 h-3.5" /> Deactivate
              </Button>
            )}

            {canDeleteCustomers && (
              <Button variant="outline" size="sm" className="gap-1 text-destructive"
                onClick={() => setConfirmAction({ ids: selectedIds })}>
                <Trash2 className="w-3.5 h-3.5" /> Delete ({selectedIds.length})
              </Button>
            )}
          </>
        )}

        {canEditCustomers && (
          <Button size="sm" className="gap-1" onClick={() => { setForm(emptyForm); setEditingId(null); setShowForm(true); }}>
            <Plus className="w-4 h-4" /> Add Customer
          </Button>
        )}
      </PageHeader>

      <DataTable
        columns={columns}
        data={customers}
        loading={isLoading}
        selectable={canEditCustomers || canDeleteCustomers}
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
        searchPlaceholder="Search customers..."
      />

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit" : "Add"} Customer</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Name *</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <PhoneInput value={form.phone} onChange={(phone) => setForm({ ...form, phone })} label="Phone" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Email</Label>
                <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div>
                <Label required>Area/Locality</Label>
                <Input
                  placeholder="e.g. Downtown, Sector 12"
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                  list="location-options"
                />
                <datalist id="location-options">
                  {existingLocations.map((loc) => <option key={loc} value={loc} />)}
                </datalist>
              </div>
            </div>

            <div>
              <Label>Address</Label>
              <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </div>

            <div>
              <Label>Notes</Label>
              <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button onClick={() => saveMutation.mutate(form)} disabled={!form.name?.trim() || !form.location?.trim() || saveMutation.isPending}>
              {editingId ? "Update" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmModal
        open={!!confirmAction}
        onClose={() => setConfirmAction(null)}
        onConfirm={() => { handleDelete(confirmAction.ids); setConfirmAction(null); }}
        title="Delete Customers"
        description={`Move ${confirmAction?.ids?.length || 0} customer(s) to Trash?`}
        confirmText="Move to Trash"
        destructive
      />

      <ProgressModal open={progress.open} title="Moving to Trash..." current={progress.current} total={progress.total} />
    </div>
  );
}
