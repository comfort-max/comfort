import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import PageHeader from "@/components/shared/PageHeader";
import ConfirmModal from "@/components/shared/ConfirmModal";
import ProgressModal from "@/components/shared/ProgressModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Trash2, RotateCcw, Search } from "lucide-react";
import { toast } from "sonner";
import { restoreBillFromTrashPayload } from "@/lib/billTrash";
import { deleteStaffWagesExpenseForSalaryRecord } from "@/hooks/useCascadeDelete";
import { invalidateAfterCustomerPaymentRecorded } from "@/lib/invalidatePaymentCaches";
import { sortStringsForDisplay } from "@/lib/utils";
import { listTrashItemsForBin, deleteTrashItemRowById } from "@/lib/trashItemsTable";
import { usePermissions } from "@/hooks/usePermissions";

/** Primary + fallback physical table names for restore inserts. */
const ENTITY_TABLES = {
  Bill: null,
  Customer: ["customers", "customer"],
  Vendor: ["vendors", "vendor"],
  Employee: ["employees", "employee"],
  BillItem: ["bill_items", "bill_item"],
  PaymentCollection: ["payment_collections", "payment_collection"],
  Expense: ["expenses", "expense"],
  SalaryRecord: ["salary_records", "salary_record"],
  VendorBilling: ["vendor_billings", "vendor_billing"],
  VendorOrder: ["vendor_orders", "vendor_order"],
  VendorRate: ["vendor_rates", "vendor_rate"],
  RateListItem: ["rate_list_items", "rate_list_item"],
  Invitation: ["invitations", "invitation"],
};

function stripRestoreRow(row) {
  if (!row || typeof row !== "object") return row;
  const { created_date, updated_date, updated_at, ...rest } = row;
  return rest;
}

async function insertRestoredRow(tables, row) {
  const payload = stripRestoreRow(row);
  let lastErr = null;
  for (const table of tables) {
    const { error } = await supabase.from(table).insert(payload);
    if (!error) return;
    lastErr = error;
    const msg = String(error.message || "");
    if (!/schema cache|does not exist|relation|42P01/i.test(msg)) {
      throw error;
    }
  }
  if (lastErr) throw lastErr;
}

export default function TrashBin() {
  const qc = useQueryClient();
  const { can } = usePermissions();
  const canEditTrash = can("admin_trash", "edit");
  const canDeleteTrash = can("admin_trash", "delete");
  const canSelectTrash = canEditTrash || canDeleteTrash;
  const [selectedIds, setSelectedIds] = useState([]);
  const [filterType, setFilterType] = useState("all");
  const [search, setSearch] = useState("");
  const [confirmPermanent, setConfirmPermanent] = useState(null);
  const [confirmRestore, setConfirmRestore] = useState(null);
  const [progress, setProgress] = useState({ open: false, current: 0, total: 0, title: "" });

  const { data: trashItems = [], isLoading } = useQuery({
    queryKey: ["trash"],
    queryFn: () => listTrashItemsForBin(3000),
  });

  const filtered = trashItems
    .filter((t) => filterType === "all" || t.original_entity === filterType)
    .filter(
      (t) =>
        !search ||
        (t.display_name || "").toLowerCase().includes(search.toLowerCase()) ||
        (t.original_entity || "").toLowerCase().includes(search.toLowerCase()) ||
        (t.deleted_by || "").toLowerCase().includes(search.toLowerCase())
    );

  const entityTypes = useMemo(
    () => sortStringsForDisplay([...new Set(trashItems.map((t) => t.original_entity))]),
    [trashItems]
  );
  const allSelected = filtered.length > 0 && filtered.every((t) => selectedIds.includes(t.id));
  const toggleAll = () => (allSelected ? setSelectedIds([]) : setSelectedIds(filtered.map((t) => t.id)));
  const toggleOne = (id) =>
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));

  const invalidateAfterRestore = () => {
    qc.invalidateQueries({ queryKey: ["trash"] });
    qc.invalidateQueries({ queryKey: ["bills-delivery"] });
    qc.invalidateQueries({ queryKey: ["bill-items"] });
    qc.invalidateQueries({ queryKey: ["bill-items-delivery"] });
    qc.invalidateQueries({ queryKey: ["vendor-billings"] });
    qc.invalidateQueries({ queryKey: ["payments-all"] });
    qc.invalidateQueries({ queryKey: ["expenses-all"] });
    qc.invalidateQueries({ queryKey: ["salary-records"] });
    qc.invalidateQueries({ queryKey: ["customers-all"] });
    qc.invalidateQueries({ queryKey: ["employees-all"] });
    qc.invalidateQueries({ queryKey: ["employees-active"] });
    qc.invalidateQueries({ queryKey: ["vendors-all"] });
    qc.invalidateQueries({ queryKey: ["rate-list"] });
    qc.invalidateQueries({ queryKey: ["invitations"] });
    invalidateAfterCustomerPaymentRecorded(qc);
  };

  const permanentDeleteMutation = useMutation({
    mutationFn: async ({ ids, onProgress }) => {
      const all = qc.getQueryData(["trash"]) || [];
      for (let i = 0; i < ids.length; i++) {
        const trashId = ids[i];
        const item = all.find((t) => t.id === trashId);
        if (item?.original_entity === "SalaryRecord" && item.data?.payment_status === "paid") {
          await deleteStaffWagesExpenseForSalaryRecord(item.data);
        }
        await deleteTrashItemRowById(trashId);
        if (onProgress) onProgress(i + 1, ids.length);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["trash"] });
      qc.invalidateQueries({ queryKey: ["expenses-all"] });
      setSelectedIds([]);
      toast.success("Permanently deleted");
    },
    onError: (e) => toast.error(e?.message || "Permanent delete failed"),
  });

  const restoreMutation = useMutation({
    mutationFn: async ({ ids, onProgress }) => {
      const all = qc.getQueryData(["trash"]) || [];
      const items = ids.map((id) => all.find((t) => t.id === id)).filter(Boolean);

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.original_entity === "Bill" && item.data?.bill) {
          await restoreBillFromTrashPayload(item.data);
        } else if (item.original_entity && item.data) {
          const tables = ENTITY_TABLES[item.original_entity];
          if (!tables) throw new Error(`Cannot restore entity type: ${item.original_entity}`);
          await insertRestoredRow(tables, item.data);
        }
        await deleteTrashItemRowById(item.id);
        if (onProgress) onProgress(i + 1, items.length);
      }
    },
    onSuccess: () => {
      invalidateAfterRestore();
      setSelectedIds([]);
      toast.success("Restored successfully");
    },
    onError: (e) => toast.error(e?.message || "Restore failed"),
  });

  const runWithProgress = (mutation, ids, title) => {
    setProgress({ open: true, current: 0, total: ids.length, title });
    mutation.mutate(
      { ids, onProgress: (cur, tot) => setProgress((p) => ({ ...p, current: cur, total: tot })) },
      { onSettled: () => setProgress({ open: false, current: 0, total: 0, title: "" }) }
    );
  };

  return (
    <div>
      <PageHeader title="Trash Bin" subtitle="Restore items to the app, or delete them forever">
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-40 h-9">
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {entityTypes.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selectedIds.length > 0 && (
          <>
            {canEditTrash && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1 text-emerald-600"
                onClick={() =>
                  setConfirmRestore({
                    ids: selectedIds,
                    count: selectedIds.length,
                  })
                }
              >
                <RotateCcw className="w-3.5 h-3.5" /> Restore selected ({selectedIds.length})
              </Button>
            )}
            {canDeleteTrash && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1 text-destructive"
                onClick={() => setConfirmPermanent({ type: "selected", ids: selectedIds })}
              >
                <Trash2 className="w-3.5 h-3.5" /> Delete forever ({selectedIds.length})
              </Button>
            )}
          </>
        )}
        {trashItems.length > 0 && canDeleteTrash && (
          <Button
            variant="destructive"
            size="sm"
            className="gap-1"
            onClick={() => setConfirmPermanent({ type: "empty", ids: trashItems.map((t) => t.id) })}
          >
            <Trash2 className="w-3.5 h-3.5" /> Empty trash
          </Button>
        )}
      </PageHeader>

      <div className="mb-4 relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search trash…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 h-9"
        />
      </div>

      <div className="border rounded-lg overflow-hidden bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 border-b">
                {canSelectTrash && (
                  <th className="px-4 py-3 w-10">
                    <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
                  </th>
                )}
                <th className="text-left px-4 py-3 text-xs font-semibold">Type</th>
                <th className="text-left px-4 py-3 text-xs font-semibold">Name</th>
                <th className="text-left px-4 py-3 text-xs font-semibold">Deleted By</th>
                <th className="text-left px-4 py-3 text-xs font-semibold">Deleted On</th>
                <th className="text-right px-4 py-3 text-xs font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array(4)
                  .fill(0)
                  .map((_, i) => (
                    <tr key={i} className="border-b">
                      {canSelectTrash && (
                        <td className="px-4 py-3">
                          <div className="w-4 h-4 bg-muted animate-pulse rounded" />
                        </td>
                      )}
                      {Array(5)
                        .fill(0)
                        .map((_, j) => (
                          <td key={j} className="px-4 py-3">
                            <div className="h-4 bg-muted animate-pulse rounded w-24" />
                          </td>
                        ))}
                    </tr>
                  ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={canSelectTrash ? 6 : 5} className="px-4 py-12 text-center text-muted-foreground">
                    {trashItems.length === 0 ? "Trash is empty" : "No items match your filter"}
                  </td>
                </tr>
              ) : (
                filtered.map((item) => (
                  <tr
                    key={item.id}
                    className={`border-b last:border-0 transition-colors hover:bg-muted/30 ${
                      selectedIds.includes(item.id) ? "bg-primary/5" : ""
                    }`}
                  >
                    {canSelectTrash && (
                      <td className="px-4 py-3">
                        <Checkbox
                          checked={selectedIds.includes(item.id)}
                          onCheckedChange={() => toggleOne(item.id)}
                        />
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <span className="text-xs bg-muted px-2 py-0.5 rounded-full font-medium">
                        {item.original_entity}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium">{item.display_name || "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{item.deleted_by || "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{item.deleted_date || "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 justify-end flex-wrap">
                        {canEditTrash && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs gap-1 text-emerald-600 border-emerald-200 hover:bg-emerald-50"
                            onClick={() => setConfirmRestore({ ids: [item.id], count: 1 })}
                            disabled={restoreMutation.isPending}
                          >
                            <RotateCcw className="w-3 h-3" /> Restore
                          </Button>
                        )}
                        {canDeleteTrash && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs gap-1 text-destructive hover:bg-destructive/10"
                            onClick={() => setConfirmPermanent({ type: "single", ids: [item.id] })}
                          >
                            <Trash2 className="w-3 h-3" /> Delete forever
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2 text-xs text-muted-foreground border-t">
          {filtered.length} item{filtered.length !== 1 ? "s" : ""}
          {selectedIds.length > 0 && ` · ${selectedIds.length} selected`}
        </div>
      </div>

      <ConfirmModal
        open={!!confirmRestore}
        onClose={() => setConfirmRestore(null)}
        onConfirm={() => {
          const ids = confirmRestore?.ids;
          setConfirmRestore(null);
          if (ids?.length) runWithProgress(restoreMutation, ids, "Restoring…");
        }}
        title="Restore from trash?"
        description={
          confirmRestore?.count > 1
            ? `This will put ${confirmRestore.count} items back into the live database. If the same IDs already exist, restore will fail for those rows.`
            : "This item will be inserted back into the live database. If the same record already exists, restore will fail."
        }
        confirmText="Restore"
      />

      <ConfirmModal
        open={!!confirmPermanent}
        onClose={() => setConfirmPermanent(null)}
        onConfirm={() => {
          const ids = confirmPermanent?.ids;
          setConfirmPermanent(null);
          if (ids?.length) runWithProgress(permanentDeleteMutation, ids, "Deleting permanently…");
        }}
        title={confirmPermanent?.type === "empty" ? "Empty trash" : "Delete forever"}
        description={
          confirmPermanent?.type === "empty"
            ? `Permanently remove all ${confirmPermanent?.ids?.length || 0} trash rows. Paid salary trash will also remove matching Staff Wages expense lines. This cannot be undone.`
            : `Permanently delete ${confirmPermanent?.ids?.length || 0} trash row(s)? Paid salary records will remove matching Staff Wages expenses. This cannot be undone.`
        }
        confirmText="Delete forever"
        destructive
      />

      <ProgressModal
        open={progress.open}
        title={progress.title || "Processing…"}
        current={progress.current}
        total={progress.total}
      />
    </div>
  );
}
