import React, { useMemo, useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { db } from "@/services/SupabaseService";
import PageHeader from "@/components/shared/PageHeader";
import DataTable from "@/components/shared/DataTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import RolePermissionMatrix from "@/components/admin/RolePermissionMatrix";
import { defaultNewRolePermissions, normalizePermissions } from "@/lib/permissions";
import { usePermissions } from "@/hooks/usePermissions";

const EMPTY_FORM = { name: "", description: "" };

export default function RoleManagement() {
  const qc = useQueryClient();
  const { can } = usePermissions();
  const canDeleteRoles = can("admin_roles", "delete");
  const canEditRoles = can("admin_roles", "edit");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [permState, setPermState] = useState(() => defaultNewRolePermissions());

  const { data: roles = [], isLoading } = useQuery({
    queryKey: ["app-roles"],
    queryFn: () => db.AppRole.list("name"),
  });

  useEffect(() => {
    if (!isDialogOpen) return;
    if (editingId) {
      const row = roles.find((r) => r.id === editingId);
      setPermState(normalizePermissions(row?.permissions));
    } else {
      setPermState(defaultNewRolePermissions());
    }
  }, [isDialogOpen, editingId, roles]);

  const saveMutation = useMutation({
    mutationFn: async (payload) => {
      if (editingId) {
        return db.AppRole.update(editingId, payload);
      }
      return db.AppRole.create(payload);
    },
    onSuccess: () => {
      toast.success(editingId ? "Role updated" : "Role created");
      setIsDialogOpen(false);
      setEditingId(null);
      setForm(EMPTY_FORM);
      qc.invalidateQueries({ queryKey: ["app-roles"] });
    },
    onError: (err) => toast.error(err?.message || "Failed to save role"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => db.AppRole.delete(id),
    onSuccess: () => {
      toast.success("Role deleted");
      qc.invalidateQueries({ queryKey: ["app-roles"] });
    },
    onError: (err) => toast.error(err?.message || "Failed to delete role"),
  });

  const columns = useMemo(
    () => [
      { key: "name", header: "Role Name", accessor: "name", sortable: true },
      {
        key: "description",
        header: "Description",
        render: (r) => r.description || "-",
      },
      {
        key: "actions",
        header: "Actions",
        render: (r) => (
          <div className="flex justify-end gap-1">
            {canEditRoles && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => {
                setEditingId(r.id);
                setForm({
                  name: r.name || "",
                  description: r.description || "",
                });
                setIsDialogOpen(true);
              }}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            )}
            {canDeleteRoles && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive hover:text-destructive"
                onClick={() => {
                  if (String(r.name).toLowerCase() === "admin") {
                    toast.error("Cannot delete the admin role");
                    return;
                  }
                  deleteMutation.mutate(r.id);
                }}
                disabled={deleteMutation.isPending}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        ),
      },
    ],
    [canDeleteRoles, canEditRoles, deleteMutation.isPending]
  );

  const handleSubmit = () => {
    const payload = {
      name: form.name.trim(),
      description: form.description.trim(),
      permissions: permState,
    };
    if (!payload.name) {
      toast.error("Role name is required");
      return;
    }
    saveMutation.mutate(payload);
  };

  return (
    <div>
      <PageHeader title="Role Management" subtitle="Define roles, then use the matrix for capabilities per module — uploads, bill/customer notifications, email templates, test email, PO send, reminders, payments, and more" permissionResource="admin_roles">
        {canEditRoles && (
        <Button
          size="sm"
          className="gap-1"
          onClick={() => {
            setEditingId(null);
            setForm(EMPTY_FORM);
            setIsDialogOpen(true);
          }}
        >
          <Plus className="w-4 h-4" /> Add Role
        </Button>
        )}
      </PageHeader>

      <DataTable columns={columns} data={roles} loading={isLoading} searchPlaceholder="Search roles..." />

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-h-[90vh] w-full max-w-[min(1600px,calc(100vw-1.5rem))] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Role" : "Add Role"}</DialogTitle>
          </DialogHeader>

          <Tabs defaultValue="details" className="w-full">
            <TabsList className="mb-3">
              <TabsTrigger value="details">Name &amp; description</TabsTrigger>
              <TabsTrigger value="permissions">Permissions</TabsTrigger>
            </TabsList>
            <TabsContent value="details" className="grid gap-4 py-2">
              <div>
                <Label>Role Name *</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="e.g. accountant"
                  disabled={!canEditRoles}
                />
              </div>
              <div>
                <Label>Description</Label>
                <Input
                  value={form.description}
                  onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                  disabled={!canEditRoles}
                />
              </div>
            </TabsContent>
            <TabsContent value="permissions" className="py-2">
              <RolePermissionMatrix value={permState} onChange={setPermState} disabled={saveMutation.isPending || !canEditRoles} />
            </TabsContent>
          </Tabs>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={saveMutation.isPending || !canEditRoles}>
              {saveMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
