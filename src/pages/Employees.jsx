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
import { deleteEmployeeCascade } from "@/hooks/useCascadeDelete";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Pencil, UserMinus, UserCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAppCurrency } from "@/hooks/useAppCurrency";
import { usePermissions } from "@/hooks/usePermissions";

const emptyForm = {
  name: "",
  phone: "",
  email: "",
  address: "",
  employee_type: "full_time",
  role: "sales_delivery",
  monthly_salary: 0,
  joining_date: "",
  notes: ""
};

/** Bills, Delivery, Payment Collection, etc. use different keys than this page — refresh all. */
const EMPLOYEE_QUERY_KEYS = [["employees-all"], ["employees-active"], ["employees-dashboard"]];

function invalidateAllEmployeeLists(qc) {
  EMPLOYEE_QUERY_KEYS.forEach((key) => qc.invalidateQueries({ queryKey: key }));
}

export default function Employees() {
  const qc = useQueryClient();
  const { format: fmt, code: curCode } = useAppCurrency();
  const { can } = usePermissions();
  const canEditEmployees = can("employees", "edit");
  const canDeleteEmployees = can("employees", "delete");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [selectedIds, setSelectedIds] = useState([]);
  const [confirmAction, setConfirmAction] = useState(null);
  const [progress, setProgress] = useState({ open: false, current: 0, total: 0 });

  const { data: employees = [], isLoading } = useQuery({
    queryKey: ["employees-all"],
    queryFn: () => db.Employee.list("-created_date", 200)
  });

  const isFormValid =
    Boolean(form.name?.trim()) &&
    Boolean(form.joining_date) &&
    Boolean(form.role) &&
    Boolean(form.employee_type) &&
    form.monthly_salary !== "" &&
    form.monthly_salary != null &&
    !Number.isNaN(Number(form.monthly_salary));

  const saveMutation = useMutation({
    mutationFn: (data) => {
      if (!data.name?.trim()) throw new Error("Name is required");
      if (!data.joining_date) throw new Error("Joining date is required");
      if (!data.role) throw new Error("Role is required");
      if (!data.employee_type) throw new Error("Type is required");
      if (data.monthly_salary === "" || data.monthly_salary == null || Number.isNaN(Number(data.monthly_salary))) {
        throw new Error("Monthly salary is required");
      }
      return editingId
        ? db.Employee.update(editingId, data)
        : db.Employee.create({ ...data, status: data.status || "active" });
    },
    onSuccess: () => {
      invalidateAllEmployeeLists(qc);
      setShowForm(false);
      setEditingId(null);
      setForm(emptyForm);
      toast.success(editingId ? "Employee updated" : "Employee added");
    },
    onError: (err) => { toast.error(err?.message || "Failed to save employee"); }
  });

  const statusMutation = useMutation({
    mutationFn: ({ ids, status }) => Promise.all(ids.map((id) => db.Employee.update(id, { status }))),
    onSuccess: () => {
      invalidateAllEmployeeLists(qc);
      setSelectedIds([]);
      toast.success("Status updated");
    },
    onError: (err) => { toast.error(err?.message || "Failed to update status"); }
  });

  // Phase-3 required soft delete setup (entityName + tableName)
  const softDelete = useSoftDelete({
    entityName: "Employee",
    tableName: "employees",
    fallbackTableName: "employee",
    getDisplayName: (r) => r.name,
    invalidateKeys: EMPLOYEE_QUERY_KEYS,
    onSuccess: () => setSelectedIds([])
  });

  // Phase-3 required cascade after soft-delete completes
  const handleDelete = async (ids) => {
    const records = employees.filter((e) => ids.includes(e.id));
    setProgress({ open: true, current: 0, total: ids.length });
    try {
      await softDelete.mutateAsync({
        ids,
        records,
        onProgress: (cur, tot) => setProgress({ open: true, current: cur, total: tot }),
      });
      await Promise.all(ids.map((id) => deleteEmployeeCascade(id)));
      qc.invalidateQueries({ queryKey: ["salary-records"] });
      qc.invalidateQueries({ queryKey: ["expenses-all"] });
    } catch (err) {
      toast.error(err?.message || "Delete failed");
    } finally {
      setProgress({ open: false, current: 0, total: 0 });
    }
  };

  const handleEdit = (emp) => {
    setForm({
      name: emp.name || "",
      phone: emp.phone || "",
      email: emp.email || "",
      address: emp.address || "",
      employee_type: emp.employee_type || "full_time",
      role: emp.role || "sales_delivery",
      monthly_salary: emp.monthly_salary || 0,
      joining_date: emp.joining_date || "",
      notes: emp.notes || ""
    });
    setEditingId(emp.id);
    setShowForm(true);
  };

  const columns = useMemo(
    () => [
      { key: "name", header: "Name", accessor: "name", sortable: true },
      { key: "phone", header: "Phone", accessor: "phone", sortable: true },
      { key: "email", header: "Email", accessor: "email" },
      {
        key: "role",
        header: "Role",
        accessor: "role",
        render: (r) => <span className="capitalize">{r.role?.replace(/_/g, " ")}</span>
      },
      { key: "type", header: "Type", render: (r) => <StatusBadge status={r.employee_type} /> },
      { key: "salary", header: "Monthly Salary", render: (r) => fmt(r.monthly_salary || 0) },
      { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} /> },
      {
        key: "actions",
        header: "",
        render: (r) =>
          canEditEmployees ? (
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); handleEdit(r); }}>
              <Pencil className="w-3.5 h-3.5" />
            </Button>
          ) : null,
      }
    ],
    [fmt, canEditEmployees]
  );

  return (
    <div>
      <PageHeader
        title="Employees"
        subtitle="Manage all employees"
        permissionResource="employees"
        exportData={employees.map((e) => ({
          Name: e.name,
          Phone: e.phone || "",
          Email: e.email || "",
          Role: e.role || "",
          Type: e.employee_type || "",
          "Monthly Salary": e.monthly_salary || 0,
          "Joining Date": e.joining_date || "",
          Status: e.status || ""
        }))}
      >
        {selectedIds.length > 0 && (
          <>
            {canEditEmployees && (
              <Button variant="outline" size="sm" className="gap-1 text-emerald-600"
                onClick={() => statusMutation.mutate({ ids: selectedIds, status: "active" })}>
                <UserCheck className="w-3.5 h-3.5" /> Activate
              </Button>
            )}

            {canEditEmployees && (
              <Button variant="outline" size="sm" className="gap-1 text-amber-600"
                onClick={() => statusMutation.mutate({ ids: selectedIds, status: "deactivated" })}>
                <UserMinus className="w-3.5 h-3.5" /> Deactivate
              </Button>
            )}

            {canDeleteEmployees && (
              <Button variant="outline" size="sm" className="gap-1 text-destructive"
                onClick={() => setConfirmAction({ ids: selectedIds })}>
                <Trash2 className="w-3.5 h-3.5" /> Delete ({selectedIds.length})
              </Button>
            )}
          </>
        )}

        {canEditEmployees && (
          <Button size="sm" className="gap-1" onClick={() => { setForm(emptyForm); setEditingId(null); setShowForm(true); }}>
            <Plus className="w-4 h-4" /> Add Employee
          </Button>
        )}
      </PageHeader>

      <DataTable
        columns={columns}
        data={employees}
        loading={isLoading}
        selectable={canEditEmployees || canDeleteEmployees}
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
        searchPlaceholder="Search employees..."
      />

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Employee" : "Add Employee"}</DialogTitle>
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
                <Label required>Joining Date</Label>
                <Input type="date" value={form.joining_date} onChange={(e) => setForm({ ...form, joining_date: e.target.value })} />
              </div>
            </div>

            <div>
              <Label>Address</Label>
              <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label required>Role</Label>
                <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="manager">Manager</SelectItem>
                    <SelectItem value="office">Office</SelectItem>
                    <SelectItem value="sales_delivery">Sales / Delivery</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label required>Type</Label>
                <Select value={form.employee_type} onValueChange={(v) => setForm({ ...form, employee_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="full_time">Full Time</SelectItem>
                    <SelectItem value="part_time">Part Time</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label required>Monthly Salary ({curCode})</Label>
                <Input type="number" value={form.monthly_salary} onChange={(e) => setForm({ ...form, monthly_salary: Number(e.target.value) })} />
              </div>
            </div>

            <div>
              <Label>Notes</Label>
              <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button onClick={() => saveMutation.mutate(form)} disabled={!isFormValid || saveMutation.isPending}>
              {editingId ? "Update" : "Add"} Employee
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmModal
        open={!!confirmAction}
        onClose={() => setConfirmAction(null)}
        onConfirm={() => { handleDelete(confirmAction.ids); setConfirmAction(null); }}
        title="Delete Employees"
        description={`Move ${confirmAction?.ids?.length || 0} employee(s) to Trash?`}
        confirmText="Move to Trash"
        destructive
      />

      <ProgressModal open={progress.open} title="Moving to Trash..." current={progress.current} total={progress.total} />
    </div>
  );
}
