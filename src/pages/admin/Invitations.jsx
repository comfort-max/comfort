import React, { useState, useMemo } from "react";
import { db, sendAdminInvite } from "@/services/SupabaseService";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import PageHeader from "@/components/shared/PageHeader";
import DataTable from "@/components/shared/DataTable";
import StatusBadge from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RefreshCw, XCircle, Eye, ListChecks } from "lucide-react";
import { toast } from "sonner";
import EmailPreviewDialog from "@/components/shared/EmailPreviewDialog";
import { buildInviteEmailContent } from "@/lib/inviteEmail";
import { usePermissions } from "@/hooks/usePermissions";

export default function Invitations() {
  const qc = useQueryClient();
  const { can } = usePermissions();
  const canManageInvitations = can("admin_invitations", "edit");
  const canRevokeInvitations = can("admin_invitations", "delete");
  const [selectedIds, setSelectedIds] = useState([]);
  const [emailPreview, setEmailPreview] = useState(null);
  const [statusTab, setStatusTab] = useState("pending");

  const { data: invitations = [], isLoading } = useQuery({
    queryKey: ["invitations"],
    queryFn: () => db.Invitation.list("-created_date", 500),
  });
  const { data: companySettings = [] } = useQuery({
    queryKey: ["company-settings"],
    queryFn: () => db.CompanySettings.list(),
    staleTime: 30 * 60 * 1000,
  });

  const companyName = companySettings[0]?.company_name || "COMFORT";
  const senderName = companySettings[0]?.email_from_name || companyName;

  const filteredInvitations = useMemo(() => {
    if (statusTab === "all") return invitations;
    return invitations.filter((i) => (i.status || "").toLowerCase() === statusTab);
  }, [invitations, statusTab]);

  const pendingInvitations = useMemo(
    () => invitations.filter((i) => (i.status || "").toLowerCase() === "pending"),
    [invitations]
  );

  const cancelMutation = useMutation({
    mutationFn: (ids) => Promise.all(ids.map((id) => db.Invitation.update(id, { status: "expired" }))),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invitations"] });
      setSelectedIds([]);
      toast.success("Invitation(s) cancelled");
    },
  });

  const resendMutation = useMutation({
    mutationFn: async (ids) => {
      const items = invitations.filter((i) => ids.includes(i.id));
      const nonPending = items.filter((i) => (i.status || "").toLowerCase() !== "pending");
      if (nonPending.length) {
        throw new Error("Only pending invitations can be resent. Adjust your selection.");
      }
      for (const inv of items) {
        await sendAdminInvite({
          invitation_id: inv.id,
          company_name: companyName,
          sender_name: senderName,
        });
      }
    },
    onSuccess: () => {
      setSelectedIds([]);
      toast.success("Invitation(s) resent");
      qc.invalidateQueries({ queryKey: ["invitations"] });
    },
    onError: (e) => toast.error(e?.message || "Resend failed"),
  });

  const selectAllPending = () => {
    setSelectedIds(pendingInvitations.map((i) => i.id));
  };

  const columns = [
    { key: "email", header: "Email", accessor: "email", sortable: true },
    {
      key: "invited_name",
      header: "Name",
      render: (r) => r.invited_name || "-",
    },
    {
      key: "role",
      header: "Role",
      accessor: "role",
      render: (r) => <span className="capitalize">{r.role || "-"}</span>,
    },
    { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} /> },
    { key: "invited_by", header: "Invited By", accessor: "invited_by" },
    { key: "created_date", header: "Date", render: (r) => r.created_date?.slice(0, 10) },
  ];

  const previewSample = (inv) => {
    const link = `${window.location.origin}/auth/accept-invite`;
    const { subject, text } = buildInviteEmailContent({
      companyName,
      senderName,
      inviteLink: link,
    });
    setEmailPreview({
      subject,
      body: text,
      recipient: { name: inv.invited_name || inv.email, email: inv.email },
    });
  };

  return (
    <div>
      <PageHeader title="Invitations" subtitle="Pending invites, resend, and bulk actions" permissionResource="admin_invitations">
        {selectedIds.length > 0 && (
          <>
            <Button
              variant="outline"
              size="sm"
              className="gap-1"
              disabled={!canManageInvitations}
              onClick={() => {
                const inv = invitations.find((i) => selectedIds.includes(i.id));
                if (inv) previewSample(inv);
              }}
            >
              <Eye className="w-3.5 h-3.5" /> Preview email
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1"
              onClick={() => resendMutation.mutate(selectedIds)}
              disabled={resendMutation.isPending || !canManageInvitations}
            >
              <RefreshCw className="w-3.5 h-3.5" /> Resend ({selectedIds.length})
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1 text-destructive"
              onClick={() => cancelMutation.mutate(selectedIds)}
              disabled={cancelMutation.isPending || !canRevokeInvitations}
            >
              <XCircle className="w-3.5 h-3.5" /> Cancel ({selectedIds.length})
            </Button>
          </>
        )}
        <Button variant="secondary" size="sm" className="gap-1" onClick={selectAllPending} disabled={!canManageInvitations}>
          <ListChecks className="w-3.5 h-3.5" /> Select all pending
        </Button>
      </PageHeader>

      <Tabs value={statusTab} onValueChange={setStatusTab} className="mb-4">
        <TabsList>
          <TabsTrigger value="pending">Pending ({pendingInvitations.length})</TabsTrigger>
          <TabsTrigger value="accepted">Accepted</TabsTrigger>
          <TabsTrigger value="expired">Cancelled / expired</TabsTrigger>
          <TabsTrigger value="all">All</TabsTrigger>
        </TabsList>
      </Tabs>

      <DataTable
        columns={columns}
        data={filteredInvitations}
        loading={isLoading}
        selectable={canManageInvitations || canRevokeInvitations}
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
        searchPlaceholder="Search invitations..."
      />
      <EmailPreviewDialog
        open={!!emailPreview}
        onClose={() => setEmailPreview(null)}
        subject={emailPreview?.subject}
        bodyText={emailPreview?.body}
        recipient={emailPreview?.recipient}
      />
    </div>
  );
}
