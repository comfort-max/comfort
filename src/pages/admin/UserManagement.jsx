import React, { useState, useMemo, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { db, sendAdminInvite, deleteAdminUser, updateAdminUser } from "@/services/SupabaseService";
import { listInvitations } from "@/lib/listInvitations";
import { filterActiveUsers } from "@/lib/activeUsers";
import { supabase } from "@/api/supabaseClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import PageHeader from "@/components/shared/PageHeader";
import DataTable from "@/components/shared/DataTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Pencil, UserPlus, Shield, Bell, Trash2, LogOut } from "lucide-react";
import { toast } from "sonner";
import ConfirmModal from "@/components/shared/ConfirmModal";
import { useAuth } from "@/lib/AuthContext";
import RolePermissionMatrix from "@/components/admin/RolePermissionMatrix";
import { normalizePermissions } from "@/lib/permissions";
import { defaultNewRolePermissions } from "@/lib/permissions";
import { sortByLocaleKey, sortStringsForDisplay } from "@/lib/utils";
import { roleNameFromAppRoleRow } from "@/lib/appRoles";
import { usePermissions } from "@/hooks/usePermissions";

export default function UserManagement() {
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, logout } = useAuth();
  const { can, isAdmin } = usePermissions();
  const canInviteUsers = can("admin_users", "invite");
  const canEditUsers = can("admin_users", "edit");
  const canEditRolesMatrix = can("admin_roles", "edit");
  const [showInvite, setShowInvite] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showRolePerms, setShowRolePerms] = useState(false);
  const [confirmDeleteUser, setConfirmDeleteUser] = useState(null);
  const [permRoleId, setPermRoleId] = useState(null);
  const [permState, setPermState] = useState(() => defaultNewRolePermissions());

  const [inviteTab, setInviteTab] = useState("employee");
  const [inviteForm, setInviteForm] = useState({
    employee_id: "",
    email: "",
    full_name: "",
    role_name: "",
  });

  const [editForm, setEditForm] = useState({
    id: "",
    full_name: "",
    email: "",
    role: "",
    phone: "",
  });

  const { data: users = [], isLoading } = useQuery({ queryKey: ["users"], queryFn: () => db.profiles.list() });
  const { data: invitations = [] } = useQuery({
    queryKey: ["invitations"],
    queryFn: listInvitations,
    staleTime: 30 * 1000,
  });

  const activeUsers = useMemo(() => filterActiveUsers(users, invitations), [users, invitations]);

  const adminCount = useMemo(
    () => users.filter((u) => String(u.role || "").toLowerCase() === "admin").length,
    [users]
  );
  const canDeleteOwnAccount = isAdmin && adminCount > 1;
  const ownAccountRow = useMemo(
    () => (user?.id ? activeUsers.find((u) => u.id === user.id) : null),
    [activeUsers, user?.id]
  );

  const { data: pendingAccessRequests = [] } = useQuery({
    queryKey: ["user-access-requests", "pending"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_access_requests")
        .select("*")
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      if (error) {
        if (/does not exist|schema cache/i.test(error.message || "")) return [];
        throw error;
      }
      return data || [];
    },
    enabled: isAdmin || can("admin_users", "edit"),
    staleTime: 30 * 1000,
  });
  const { data: employees = [] } = useQuery({
    queryKey: ["employees-active"],
    queryFn: () => db.Employee.filter({ status: "active" }),
  });
  const {
    data: appRoles = [],
    isError: appRolesError,
    error: appRolesQueryError,
    refetch: refetchAppRoles,
  } = useQuery({
    queryKey: ["app-roles"],
    queryFn: () => db.AppRole.list("name"),
  });

  const { data: companySettings = [] } = useQuery({
    queryKey: ["company-settings-users"],
    queryFn: () => db.CompanySettings.list(),
    staleTime: 60 * 1000,
  });
  const companyName = companySettings[0]?.company_name || "COMFORT";
  const senderName = companySettings[0]?.email_from_name || companyName;

  const profileRoleNames = useMemo(() => {
    const s = new Set();
    for (const u of users) {
      const r = String(u?.role ?? "").trim();
      if (r) s.add(r);
    }
    return s;
  }, [users]);

  const roleOptions = useMemo(() => {
    const names = new Set();
    for (const row of appRoles) {
      const n = roleNameFromAppRoleRow(row);
      if (n) names.add(n);
    }
    for (const n of profileRoleNames) names.add(n);
    return sortStringsForDisplay([...names]);
  }, [appRoles, profileRoleNames]);

  const inviteRoleDefault = useMemo(() => {
    if (!roleOptions.length) return "";
    return roleOptions[0];
  }, [roleOptions]);

  useEffect(() => {
    if (showInvite && !inviteForm.role_name) {
      setInviteForm((f) => ({ ...f, role_name: inviteRoleDefault }));
    }
  }, [showInvite, inviteRoleDefault, inviteForm.role_name]);

  useEffect(() => {
    if (!appRolesError) return;
    toast.error(appRolesQueryError?.message || "Could not load roles from the database.");
  }, [appRolesError, appRolesQueryError]);

  const selectedPermRole = useMemo(() => appRoles.find((r) => r.id === permRoleId), [appRoles, permRoleId]);

  const employeesSorted = useMemo(() => sortByLocaleKey(employees), [employees]);

  useEffect(() => {
    if (!showRolePerms || !selectedPermRole) return;
    setPermState(normalizePermissions(selectedPermRole.permissions));
  }, [showRolePerms, selectedPermRole]);

  const inviteMutation = useMutation({
    mutationFn: async () => {
      const email = inviteForm.email.trim().toLowerCase();
      if (!email) throw new Error("Email is required");
      const role = inviteForm.role_name || inviteRoleDefault;
      if (!role) throw new Error("Add at least one role under Administration → Role Management before inviting users.");
      await sendAdminInvite({
        email,
        role_name: role,
        invited_by: user?.full_name || user?.email || "",
        employee_id: inviteTab === "employee" && inviteForm.employee_id ? inviteForm.employee_id : null,
        invited_name: inviteForm.full_name?.trim() || null,
        company_name: companyName,
        sender_name: senderName,
      });
    },
    onSuccess: () => {
      setShowInvite(false);
      setInviteForm({ employee_id: "", email: "", full_name: "", role_name: inviteRoleDefault });
      toast.success("Invitation email sent");
      qc.invalidateQueries({ queryKey: ["invitations"] });
      qc.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (err) =>
      toast.error(
        err?.message ||
          "Invite failed. On Vercel, add SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, EMAIL_USER, and EMAIL_PASS (see the notice on this page), then redeploy."
      ),
  });

  const openEditUser = (u) => {
    setEditForm({
      id: u.id,
      full_name: u.full_name || "",
      email: u.email || "",
      role: u.role || "user",
      phone: u.phone || "",
    });
    setShowEdit(true);
  };

  useEffect(() => {
    const userId = searchParams.get("userId");
    if (!userId || isLoading || !canEditUsers) return;
    const match = activeUsers.find((u) => u.id === userId);
    if (match) {
      openEditUser(match);
      const next = new URLSearchParams(searchParams);
      next.delete("userId");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, activeUsers, isLoading, canEditUsers]);

  const updateUserMutation = useMutation({
    mutationFn: async (data) => {
      const payload = {
        id: data.id,
        full_name: data.full_name?.trim() || null,
        role: data.role || "user",
      };
      if (Object.prototype.hasOwnProperty.call(data, "phone")) {
        payload.phone = data.phone?.trim() || null;
      }
      if (data.email) payload.email = data.email;
      return updateAdminUser(payload);
    },
    onSuccess: async (_, variables) => {
      setShowEdit(false);
      toast.success("User profile updated");
      qc.invalidateQueries({ queryKey: ["users"] });
      try {
        await supabase
          .from("user_access_requests")
          .update({ status: "approved", updated_at: new Date().toISOString() })
          .eq("user_id", variables.id)
          .eq("status", "pending");
        qc.invalidateQueries({ queryKey: ["user-access-requests"] });
      } catch (_) {
        /* table may not exist yet */
      }
    },
    onError: (err) => {
      toast.error(err?.message || "Failed to update user");
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: (userId) => deleteAdminUser(userId),
    onSuccess: async (result) => {
      if (result?.selfDeleted) {
        setConfirmDeleteUser(null);
        setShowEdit(false);
        await logout();
        return;
      }
      setConfirmDeleteUser(null);
      setShowEdit(false);
      toast.success("User deleted");
      qc.invalidateQueries({ queryKey: ["users"] });
      qc.invalidateQueries({ queryKey: ["user-access-requests"] });
    },
    onError: (err) => toast.error(err?.message || "Failed to delete user"),
  });

  const openDeleteOwnAccount = () => {
    if (!canDeleteOwnAccount) {
      toast.error("Promote another user to Admin before deleting your account.");
      return;
    }
    const row = ownAccountRow || {
      id: user?.id,
      email: user?.email,
      full_name: user?.full_name,
      role: user?.role,
    };
    if (row?.id) setConfirmDeleteUser({ ...row, selfDelete: true });
  };

  const saveRolePermissionsMutation = useMutation({
    mutationFn: async () => {
      if (!permRoleId) throw new Error("No role selected");
      if (String(roleNameFromAppRoleRow(selectedPermRole)).toLowerCase() === "admin") {
        throw new Error("Admin always has full access");
      }
      return db.AppRole.update(permRoleId, { permissions: permState });
    },
    onSuccess: () => {
      toast.success("Role permissions saved");
      setShowRolePerms(false);
      qc.invalidateQueries({ queryKey: ["app-roles"] });
    },
    onError: (e) => toast.error(e?.message || "Save failed"),
  });

  const openRolePermissions = (roleName) => {
    const match = appRoles.find(
      (r) => String(roleNameFromAppRoleRow(r)).toLowerCase() === String(roleName || "").toLowerCase()
    );
    if (!match) {
      toast.error("Add this role under Role Management first, or assign an existing role to the user.");
      return;
    }
    if (String(roleNameFromAppRoleRow(match)).toLowerCase() === "admin") {
      toast.info("Admin has unrestricted access.");
      return;
    }
    setPermRoleId(match.id);
    setShowRolePerms(true);
  };

  const columns = [
    { key: "name", header: "Name", accessor: "full_name", sortable: true },
    { key: "email", header: "Email", accessor: "email", sortable: true },
    {
      key: "role",
      header: "Role",
      accessor: "role",
      render: (r) => <span className="capitalize">{r.role || "-"}</span>,
    },
    {
      key: "actions",
      header: "",
      render: (r) => (
        <div className="flex justify-end gap-1">
          {canEditRolesMatrix && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            title="Role permissions"
            onClick={() => openRolePermissions(r.role)}
          >
            <Shield className="h-4 w-4" />
          </Button>
          )}
          {canEditUsers && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => openEditUser(r)}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          )}
          {isAdmin && r.id !== user?.id && String(r.role || "").toLowerCase() !== "admin" && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-destructive hover:text-destructive"
              title="Delete user"
              onClick={() => setConfirmDeleteUser(r)}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="User Management" subtitle="Invite users, assign roles, and edit permissions per role" permissionResource="admin_users">
        {isAdmin && (
          <Button
            variant="outline"
            size="sm"
            className="gap-1 text-destructive hover:text-destructive"
            onClick={openDeleteOwnAccount}
            disabled={deleteUserMutation.isPending}
            title={
              canDeleteOwnAccount
                ? "Permanently delete your account and sign out"
                : "Add another administrator before you can delete your account"
            }
          >
            <LogOut className="w-4 h-4" /> Delete my account & exit
          </Button>
        )}
        {canInviteUsers && (
        <Button size="sm" className="gap-1" onClick={() => setShowInvite(true)}>
          <UserPlus className="w-4 h-4" /> Invite user
        </Button>
        )}
      </PageHeader>

      {pendingAccessRequests.length > 0 && canEditUsers && (
        <div className="mb-4 rounded-lg border border-amber-300/60 bg-amber-50/80 dark:bg-amber-950/30 px-4 py-3 space-y-2">
          <p className="text-sm font-medium flex items-center gap-2">
            <Bell className="w-4 h-4 text-amber-700" />
            {pendingAccessRequests.length} pending access request
            {pendingAccessRequests.length !== 1 ? "s" : ""}
          </p>
          <ul className="text-sm space-y-1">
            {pendingAccessRequests.slice(0, 5).map((req) => (
              <li key={req.id} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  {req.full_name || req.email}{" "}
                  <span className="text-muted-foreground">({req.email}) · role: {req.profile_role || "user"}</span>
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8"
                  onClick={() => {
                    const u = users.find((x) => x.id === req.user_id);
                    if (u) openEditUser(u);
                    else toast.error("User profile not found — they may need to sign in once more.");
                  }}
                >
                  Review & assign role
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <DataTable columns={columns} data={activeUsers} loading={isLoading} searchPlaceholder="Search users..." />

      <Dialog open={showInvite} onOpenChange={setShowInvite}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Invite user</DialogTitle>
          </DialogHeader>
          <Tabs value={inviteTab} onValueChange={setInviteTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="employee">From employees</TabsTrigger>
              <TabsTrigger value="manual">Not in employees</TabsTrigger>
            </TabsList>
            <TabsContent value="employee" className="grid gap-3 pt-3">
              <div>
                <Label>Employee</Label>
                <Select
                  value={inviteForm.employee_id || "__none__"}
                  onValueChange={(id) => {
                    if (id === "__none__") {
                      setInviteForm((f) => ({ ...f, employee_id: "", email: f.email }));
                      return;
                    }
                    const e = employees.find((x) => x.id === id);
                    setInviteForm((f) => ({
                      ...f,
                      employee_id: id,
                      email: e?.email || f.email,
                      full_name: e?.name || f.full_name,
                    }));
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select employee" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Choose…</SelectItem>
                    {employeesSorted.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </TabsContent>
            <TabsContent value="manual" className="grid gap-3 pt-3">
              <div>
                <Label>Display name (optional)</Label>
                <Input
                  value={inviteForm.full_name}
                  onChange={(e) => setInviteForm((f) => ({ ...f, full_name: e.target.value }))}
                  placeholder="Full name"
                />
              </div>
            </TabsContent>
          </Tabs>
          <div className="grid gap-3 pt-1">
            <div>
              <Label>Email *</Label>
              <Input
                type="email"
                value={inviteForm.email}
                onChange={(e) => setInviteForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="user@example.com"
              />
            </div>
            <div>
              <Label>Role at signup *</Label>
              {roleOptions.length === 0 ? (
                <p className="text-sm text-destructive py-2">
                  No roles available. Add roles under <strong>Administration → Role Management</strong> first.
                </p>
              ) : (
                <Select
                  value={
                    roleOptions.includes(inviteForm.role_name || inviteRoleDefault)
                      ? inviteForm.role_name || inviteRoleDefault
                      : inviteRoleDefault
                  }
                  onValueChange={(v) => setInviteForm((f) => ({ ...f, role_name: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {appRolesError && (
                      <div className="px-2 py-1.5 text-xs text-destructive">
                        Could not load <code className="text-[10px]">app_roles</code>.{" "}
                        <button type="button" className="underline font-medium" onClick={() => refetchAppRoles()}>
                          Retry
                        </button>
                      </div>
                    )}
                    {roleOptions.map((name) => (
                      <SelectItem key={name} value={name}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <p className="text-[11px] text-muted-foreground pt-1">
                Roles are loaded from <strong className="text-foreground">Administration → Role Management</strong> (
                <code className="text-[10px]">app_roles</code>
                ), plus any roles already assigned to existing users.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowInvite(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => inviteMutation.mutate()}
              disabled={inviteMutation.isPending || roleOptions.length === 0}
            >
              {inviteMutation.isPending ? "Sending…" : "Send invitation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showEdit} onOpenChange={setShowEdit}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit user</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div>
              <Label>Email</Label>
              <Input value={editForm.email} disabled />
            </div>
            <div>
              <Label>Full name</Label>
              <Input
                value={editForm.full_name}
                onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })}
              />
            </div>
            <div>
              <Label>Phone</Label>
              <Input
                value={editForm.phone}
                onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                placeholder="+91XXXXXXXXXX"
              />
            </div>
            <div>
              <Label>Role</Label>
              <Select value={editForm.role} onValueChange={(v) => setEditForm({ ...editForm, role: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {roleOptions.map((name) => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-col sm:space-x-0">
            {isAdmin && editForm.id === user?.id && (
              <Button
                type="button"
                variant="outline"
                className="w-full gap-1 text-destructive hover:text-destructive"
                disabled={deleteUserMutation.isPending}
                onClick={openDeleteOwnAccount}
              >
                <LogOut className="w-4 h-4" /> Delete my account & exit
              </Button>
            )}
            <div className="flex w-full justify-end gap-2">
              <Button variant="outline" onClick={() => setShowEdit(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => updateUserMutation.mutate(editForm)}
                disabled={updateUserMutation.isPending || !editForm.id}
              >
                {updateUserMutation.isPending ? "Saving…" : "Save"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showRolePerms} onOpenChange={setShowRolePerms}>
        <DialogContent className="max-h-[90vh] w-full max-w-[min(1600px,calc(100vw-1.5rem))] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Permissions — {roleNameFromAppRoleRow(selectedPermRole) || selectedPermRole?.name}</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground pb-2">
            Changes apply to all users with this role. The same matrix is available under Role Management.
          </p>
          <RolePermissionMatrix
            value={permState}
            onChange={setPermState}
            disabled={saveRolePermissionsMutation.isPending || !canEditRolesMatrix}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRolePerms(false)}>
              Close
            </Button>
            <Button
              onClick={() => saveRolePermissionsMutation.mutate()}
              disabled={saveRolePermissionsMutation.isPending || !canEditRolesMatrix}
            >
              {saveRolePermissionsMutation.isPending ? "Saving…" : "Save permissions"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmModal
        open={!!confirmDeleteUser}
        onClose={() => !deleteUserMutation.isPending && setConfirmDeleteUser(null)}
        onConfirm={() => {
          if (confirmDeleteUser?.id) deleteUserMutation.mutate(confirmDeleteUser.id);
        }}
        title={confirmDeleteUser?.selfDelete ? "Delete your account & exit?" : "Delete user?"}
        description={
          confirmDeleteUser?.selfDelete
            ? "Permanently delete your administrator account and sign out? You will lose access to COMFORT and cannot undo this. Another administrator must remain active."
            : confirmDeleteUser
              ? `Permanently delete ${confirmDeleteUser.full_name || confirmDeleteUser.email || "this user"}? Their login will be removed and they will no longer be able to sign in. This cannot be undone.`
              : ""
        }
        confirmText={confirmDeleteUser?.selfDelete ? "Delete my account & exit" : "Delete user"}
        destructive
        loading={deleteUserMutation.isPending}
      />
    </div>
  );
}
