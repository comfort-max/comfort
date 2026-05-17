import React, { useState, useMemo, useEffect } from "react";
import { Link } from "react-router-dom";
import { db, sendAdminInvite } from "@/services/SupabaseService";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import PageHeader from "@/components/shared/PageHeader";
import DataTable from "@/components/shared/DataTable";
import StatusBadge from "@/components/shared/StatusBadge";
import ConfirmModal from "@/components/shared/ConfirmModal";
import ProgressModal from "@/components/shared/ProgressModal";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RefreshCw, XCircle, Eye, ListChecks, Download, Trash2 } from "lucide-react";
import { toast } from "sonner";
import EmailPreviewDialog from "@/components/shared/EmailPreviewDialog";
import { buildInviteEmailContent } from "@/lib/inviteEmail";
import { getAppInstallUrl } from "@/lib/appOrigin";
import { normalizeInvitationStatus } from "@/lib/invitationStatus";
import { usePermissions } from "@/hooks/usePermissions";
import { useSoftDelete } from "@/hooks/useSoftDelete";

export default function Invitations() {
  const qc = useQueryClient();
  const { can } = usePermissions();
  const canManageInvitations = can("admin_invitations", "edit");
  const canRevokeInvitations = can("admin_invitations", "delete");
  const [selectedIds, setSelectedIds] = useState([]);
  const [emailPreview, setEmailPreview] = useState(null);
  const [statusTab, setStatusTab] = useState("pending");
  const [confirmTrash, setConfirmTrash] = useState(null);
  const [progress, setProgress] = useState({ open: false, current: 0, total: 0 });

  const { data: invitations = [], isLoading } = useQuery({
    queryKey: ["invitations"],
    queryFn: () => db.Invitation.list("-created_date", 500),
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
  const { data: companySettings = [] } = useQuery({
    queryKey: ["company-settings"],
    queryFn: () => db.CompanySettings.list(),
    staleTime: 30 * 60 * 1000,
  });

  const companyName = companySettings[0]?.company_name || "COMFORT";
  const senderName = companySettings[0]?.email_from_name || companyName;
  const installUrl = getAppInstallUrl();

  const tabCounts = useMemo(() => {
    const counts = { pending: 0, accepted: 0, expired: 0, all: invitations.length };
    for (const inv of invitations) {
      const s = normalizeInvitationStatus(inv.status);
      if (s === "pending" || s === "accepted" || s === "expired") counts[s] += 1;
    }
    return counts;
  }, [invitations]);

  const filteredInvitations = useMemo(() => {
    if (statusTab === "all") return invitations;
    return invitations.filter((i) => normalizeInvitationStatus(i.status) === statusTab);
  }, [invitations, statusTab]);

  const pendingInvitations = useMemo(
    () => invitations.filter((i) => normalizeInvitationStatus(i.status) === "pending"),
    [invitations]
  );

  useEffect(() => {
    setSelectedIds([]);
  }, [statusTab]);

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
      const nonPending = items.filter((i) => normalizeInvitationStatus(i.status) !== "pending");
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

  const softDelete = useSoftDelete({
    entityName: "Invitation",
    tableName: "invitations",
    fallbackTableName: "invitation",
    getDisplayName: (r) => r.invited_name || r.email || r.id,
    invalidateKeys: [["invitations"]],
    onSuccess: () => setSelectedIds([]),
  });

  const handleMoveToTrash = async (ids) => {
    const records = invitations.filter((i) => ids.includes(i.id));
    setProgress({ open: true, current: 0, total: ids.length });
    try {
      await softDelete.mutateAsync({
        ids,
        records,
        onProgress: (cur, tot) => setProgress({ open: true, current: cur, total: tot }),
      });
    } catch (err) {
      toast.error(err?.message || "Move to trash failed");
    } finally {
      setProgress({ open: false, current: 0, total: 0 });
    }
  };

  const selectAllPending = () => {
    setSelectedIds(pendingInvitations.map((i) => i.id));
  };

  const selectAllInTab = () => {
    setSelectedIds(filteredInvitations.map((i) => i.id));
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
    { key: "status", header: "Status", render: (r) => <StatusBadge status={normalizeInvitationStatus(r.status)} /> },
    { key: "invited_by", header: "Invited By", accessor: "invited_by" },
    { key: "created_date", header: "Date", render: (r) => r.created_date?.slice(0, 10) },
  ];

  const previewSample = (inv) => {
    const link = `${window.location.origin}/auth/accept-invite`;
    const { subject, text } = buildInviteEmailContent({
      companyName,
      senderName,
      inviteLink: link,
      installUrl,
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
        <Button variant="outline" size="sm" className="gap-1" asChild>
          <Link to="/install" target="_blank" rel="noreferrer">
            <Download className="w-3.5 h-3.5" /> Install instructions
          </Link>
        </Button>
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
            {canRevokeInvitations && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1 text-destructive"
                onClick={() => setConfirmTrash({ ids: selectedIds })}
                disabled={softDelete.isPending}
              >
                <Trash2 className="w-3.5 h-3.5" /> Move to Trash ({selectedIds.length})
              </Button>
            )}
          </>
        )}
        <Button
          variant="secondary"
          size="sm"
          className="gap-1"
          onClick={selectAllInTab}
          disabled={!filteredInvitations.length || (!canManageInvitations && !canRevokeInvitations)}
        >
          <ListChecks className="w-3.5 h-3.5" /> Select all in tab
        </Button>
        <Button variant="secondary" size="sm" className="gap-1" onClick={selectAllPending} disabled={!canManageInvitations}>
          <ListChecks className="w-3.5 h-3.5" /> Select all pending
        </Button>
      </PageHeader>

      <Tabs value={statusTab} onValueChange={setStatusTab} className="mb-4">
        <TabsList>
          <TabsTrigger value="pending">Pending ({tabCounts.pending})</TabsTrigger>
          <TabsTrigger value="accepted">Accepted ({tabCounts.accepted})</TabsTrigger>
          <TabsTrigger value="expired">Cancelled / expired ({tabCounts.expired})</TabsTrigger>
          <TabsTrigger value="all">All ({tabCounts.all})</TabsTrigger>
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
        emptyMessage={
          statusTab === "all"
            ? "No invitations found"
            : `No ${statusTab === "expired" ? "cancelled or expired" : statusTab} invitations`
        }
      />
      <EmailPreviewDialog
        open={!!emailPreview}
        onClose={() => setEmailPreview(null)}
        subject={emailPreview?.subject}
        bodyText={emailPreview?.body}
        recipient={emailPreview?.recipient}
      />

      <ConfirmModal
        open={!!confirmTrash}
        onClose={() => setConfirmTrash(null)}
        onConfirm={() => {
          handleMoveToTrash(confirmTrash.ids);
          setConfirmTrash(null);
        }}
        title="Move invitations to Trash"
        description={`Move ${confirmTrash?.ids?.length || 0} invitation(s) to Trash? You can restore them from Administration → Trash Bin.`}
        confirmText="Move to Trash"
        destructive
        loading={softDelete.isPending}
      />

      <ProgressModal open={progress.open} title="Moving to Trash…" current={progress.current} total={progress.total} />
    </div>
  );
}
