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
import { deleteVendorCascade } from "@/hooks/useCascadeDelete";
import { formatCurrencyAmount } from "@/lib/currency";
import { vendorBillingSignedDue } from "@/lib/paymentBalance";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Pencil, UserMinus, UserCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { sortStringsForDisplay } from "@/lib/utils";
import { usePermissions } from "@/hooks/usePermissions";

const emptyForm = { name: "", phone: "", email: "", address: "", payment_terms: "", notes: "" };

export default function Vendors() {
  const qc = useQueryClient();
  const { can } = usePermissions();
  const canEditVendors = can("vendors", "edit");
  const canDeleteVendors = can("vendors", "delete");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [selectedIds, setSelectedIds] = useState([]);
  const [confirmAction, setConfirmAction] = useState(null);
  const [progress, setProgress] = useState({ open: false, current: 0, total: 0 });

  const { data: vendors = [], isLoading } = useQuery({
    queryKey: ["vendors-all"],
    queryFn: () => db.Vendor.list("-created_date", 200)
  });

  const { data: settings = [] } = useQuery({
    queryKey: ["company-settings"],
    queryFn: () => db.CompanySettings.list()
  });

  const { data: vendorBillings = [] } = useQuery({
    queryKey: ["vendor-billings"],
    queryFn: () => db.VendorBilling.list("-created_date", 500),
  });

  const settingsRow = settings[0];

  const paymentTermsOptions = useMemo(
    () => sortStringsForDisplay(settings[0]?.payment_terms || ["Net 15", "Net 30", "Net 45", "Immediate"]),
    [settings]
  );

  const vendorCreditById = useMemo(() => {
    const m = {};
    for (const vb of vendorBillings) {
      const vid = vb.vendor_id;
      if (!vid) continue;
      const due = vendorBillingSignedDue(vb);
      if (due >= 0) continue;
      m[vid] = (m[vid] || 0) + -due;
    }
    return m;
  }, [vendorBillings]);

  const saveMutation = useMutation({
    mutationFn: (data) => (editingId ? db.Vendor.update(editingId, data) : db.Vendor.create(data)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vendors-all"] });
      setShowForm(false);
      setEditingId(null);
      setForm(emptyForm);
      toast.success(editingId ? "Vendor updated" : "Vendor added");
    },
    onError: (err) => { toast.error(err?.message || "Failed to save vendor"); }
  });

  const statusMutation = useMutation({
    mutationFn: ({ ids, status }) => Promise.all(ids.map((id) => db.Vendor.update(id, { status }))),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vendors-all"] });
      setSelectedIds([]);
      toast.success("Status updated");
    },
    onError: (err) => { toast.error(err?.message || "Failed to update status"); }
  });

  const softDelete = useSoftDelete({
    entityName: "Vendor",
    tableName: "vendors",
    fallbackTableName: "vendor",
    getDisplayName: (r) => r.name,
    invalidateKeys: [["vendors-all"]],
    onSuccess: () => setSelectedIds([])
  });

  const handleDelete = (ids) => {
    const records = vendors.filter((v) => ids.includes(v.id));
    setProgress({ open: true, current: 0, total: ids.length });

    softDelete.mutate(
      { ids, records, onProgress: (cur, tot) => setProgress({ open: true, current: cur, total: tot }) },
      {
        onSuccess: async () => {
          await Promise.all(ids.map((id) => deleteVendorCascade(id)));
          qc.invalidateQueries({ queryKey: ["vendor-billings"] });
        },
        onSettled: () => setProgress({ open: false, current: 0, total: 0 })
      }
    );
  };

  const handleEdit = (v) => {
    setForm({
      name: v.name || "",
      phone: v.phone || "",
      email: v.email || "",
      address: v.address || "",
      payment_terms: v.payment_terms || "",
      notes: v.notes || ""
    });
    setEditingId(v.id);
    setShowForm(true);
  };

  const columns = [
    { key: "name", header: "Name", accessor: "name", sortable: true },
    { key: "phone", header: "Phone", accessor: "phone" },
    { key: "email", header: "Email", accessor: "email" },
    { key: "payment_terms", header: "Payment Terms", accessor: "payment_terms" },
    {
      key: "vendor_credit",
      header: "Overpaid / credit",
      sortable: true,
      accessor: (r) => vendorCreditById[r.id] || 0,
      render: (r) => {
        const c = vendorCreditById[r.id] || 0;
        if (!c) return <span className="text-muted-foreground">—</span>;
        return <span className="text-cyan-800 font-medium">{formatCurrencyAmount(c, settingsRow)}</span>;
      },
    },
    { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status || "active"} /> },
    {
      key: "actions",
      header: "",
      render: (r) =>
        canEditVendors ? (
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); handleEdit(r); }}>
            <Pencil className="w-3.5 h-3.5" />
          </Button>
        ) : null,
    }
  ];

  return (
    <div>
      <PageHeader
        title="Vendors"
        subtitle="Manage vendor database"
        permissionResource="vendors"
        exportData={vendors.map((v) => ({
          Name: v.name,
          Phone: v.phone || "",
          Email: v.email || "",
          "Payment Terms": v.payment_terms || "",
          "Overpaid / credit": vendorCreditById[v.id]
            ? formatCurrencyAmount(vendorCreditById[v.id], settingsRow)
            : "",
          Status: v.status || ""
        }))}
      >
        {selectedIds.length > 0 && (
          <>
            {canEditVendors && (
              <Button variant="outline" size="sm" className="gap-1 text-emerald-600"
                onClick={() => statusMutation.mutate({ ids: selectedIds, status: "active" })}>
                <UserCheck className="w-3.5 h-3.5" /> Activate
              </Button>
            )}

            {canEditVendors && (
              <Button variant="outline" size="sm" className="gap-1 text-amber-600"
                onClick={() => statusMutation.mutate({ ids: selectedIds, status: "deactivated" })}>
                <UserMinus className="w-3.5 h-3.5" /> Deactivate
              </Button>
            )}

            {canDeleteVendors && (
              <Button variant="outline" size="sm" className="gap-1 text-destructive"
                onClick={() => setConfirmAction({ ids: selectedIds })}>
                <Trash2 className="w-3.5 h-3.5" /> Delete ({selectedIds.length})
              </Button>
            )}
          </>
        )}

        {canEditVendors && (
          <Button size="sm" className="gap-1" onClick={() => { setForm(emptyForm); setEditingId(null); setShowForm(true); }}>
            <Plus className="w-4 h-4" /> Add Vendor
          </Button>
        )}
      </PageHeader>

      <DataTable
        columns={columns}
        data={vendors}
        loading={isLoading}
        selectable={canEditVendors || canDeleteVendors}
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
        searchPlaceholder="Search vendors..."
      />

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit" : "Add"} Vendor</DialogTitle>
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
                <Label>Payment Terms</Label>
                <Select value={form.payment_terms} onValueChange={(v) => setForm({ ...form, payment_terms: v })}>
                  <SelectTrigger><SelectValue placeholder="Select terms" /></SelectTrigger>
                  <SelectContent>
                    {paymentTermsOptions.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
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
            <Button onClick={() => saveMutation.mutate(form)} disabled={!form.name}>
              {editingId ? "Update" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmModal
        open={!!confirmAction}
        onClose={() => setConfirmAction(null)}
        onConfirm={() => { handleDelete(confirmAction.ids); setConfirmAction(null); }}
        title="Delete Vendors"
        description={`Move ${confirmAction?.ids?.length || 0} vendor(s) to Trash?`}
        confirmText="Move to Trash"
        destructive
      />

      <ProgressModal open={progress.open} title="Moving to Trash..." current={progress.current} total={progress.total} />
    </div>
  );
}
