import React, { useState } from "react";
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

export default function TrashBin() {
  const qc = useQueryClient();
  const [selectedIds, setSelectedIds] = useState([]);
  const [filterType, setFilterType] = useState('all');
  const [search, setSearch] = useState('');
  const [confirmAction, setConfirmAction] = useState(null);
  const [progress, setProgress] = useState({ open: false, current: 0, total: 0, title: "" });

  const { data: trashItems = [], isLoading } = useQuery({
    queryKey: ['trash'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('trash_items')
        .select('*')
        .order('created_date', { ascending: false })
        .limit(500);
      if (error) throw error;
      return data || [];
    },
  });

  const filtered = trashItems
    .filter(t => filterType === 'all' || t.original_entity === filterType)
    .filter(t =>
      !search ||
      (t.display_name || '').toLowerCase().includes(search.toLowerCase()) ||
      (t.original_entity || '').toLowerCase().includes(search.toLowerCase()) ||
      (t.deleted_by || '').toLowerCase().includes(search.toLowerCase())
    );

  const entityTypes = [...new Set(trashItems.map(t => t.original_entity))].sort();
  const allSelected = filtered.length > 0 && filtered.every(t => selectedIds.includes(t.id));
  const toggleAll = () => allSelected ? setSelectedIds([]) : setSelectedIds(filtered.map(t => t.id));
  const toggleOne = (id) => setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);

  const permanentDeleteMutation = useMutation({
    mutationFn: async ({ ids, onProgress }) => {
      for (let i = 0; i < ids.length; i++) {
        const { error } = await supabase.from('trash_items').delete().eq('id', ids[i]);
        if (error) throw error;
        if (onProgress) onProgress(i + 1, ids.length);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['trash'] });
      setSelectedIds([]);
      toast.success("Permanently deleted");
    }
  });

  const restoreMutation = useMutation({
    mutationFn: async ({ ids, onProgress }) => {
      const items = trashItems.filter(t => ids.includes(t.id));

      // Map entity names to table names
      const entityToTable = {
        Bill: 'bills', Customer: 'customers', Vendor: 'vendors',
        Employee: 'employees', BillItem: 'bill_items',
        PaymentCollection: 'payment_collections', Expense: 'expenses',
        SalaryRecord: 'salary_records', VendorBilling: 'vendor_billings',
        VendorOrder: 'vendor_orders', VendorRate: 'vendor_rates',
        RateListItem: 'rate_list_items',
      };

      for (let i = 0; i < items.length; i++) {
        const item = items[i];

        if (item.original_entity && item.data) {
          const { id, created_date, updated_date, ...data } = item.data;
          const table = entityToTable[item.original_entity];
          if (table) {
            const { error } = await supabase.from(table).insert(data);
            if (error) throw error;
          }
        }

        await supabase.from('trash_items').delete().eq('id', item.id);
        if (onProgress) onProgress(i + 1, items.length);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['trash'] });
      setSelectedIds([]);
      toast.success("Restored successfully");
    }
  });

  const runWithProgress = (mutation, ids, title) => {
    setProgress({ open: true, current: 0, total: ids.length, title });
    mutation.mutate(
      { ids, onProgress: (cur, tot) => setProgress(p => ({ ...p, current: cur, total: tot })) },
      { onSettled: () => setProgress({ open: false, current: 0, total: 0, title: "" }) }
    );
  };

  return (
    <div>
      <PageHeader title="Trash Bin" subtitle="Restore or permanently delete items">
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-40 h-9"><SelectValue placeholder="All Types" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {entityTypes.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>

        {selectedIds.length > 0 && (
          <>
            <Button variant="outline" size="sm" className="gap-1 text-emerald-600"
              onClick={() => runWithProgress(restoreMutation, selectedIds, 'Restoring...')}>
              <RotateCcw className="w-3.5 h-3.5" /> Restore ({selectedIds.length})
            </Button>
            <Button variant="outline" size="sm" className="gap-1 text-destructive"
              onClick={() => setConfirmAction({ type: 'selected', ids: selectedIds })}>
              <Trash2 className="w-3.5 h-3.5" /> Delete ({selectedIds.length})
            </Button>
          </>
        )}

        {trashItems.length > 0 && (
          <Button variant="destructive" size="sm" className="gap-1"
            onClick={() => setConfirmAction({ type: 'empty', ids: trashItems.map(t => t.id) })}>
            <Trash2 className="w-3.5 h-3.5" /> Empty Trash
          </Button>
        )}
      </PageHeader>

      <div className="mb-4 relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Search trash..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9" />
      </div>

      <div className="border rounded-lg overflow-hidden bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 border-b">
                <th className="px-4 py-3 w-10"><Checkbox checked={allSelected} onCheckedChange={toggleAll} /></th>
                <th className="text-left px-4 py-3 text-xs font-semibold">Type</th>
                <th className="text-left px-4 py-3 text-xs font-semibold">Name</th>
                <th className="text-left px-4 py-3 text-xs font-semibold">Deleted By</th>
                <th className="text-left px-4 py-3 text-xs font-semibold">Deleted On</th>
                <th className="text-right px-4 py-3 text-xs font-semibold">Actions</th>
              </tr>
            </thead>

            <tbody>
              {isLoading ? (
                Array(4).fill(0).map((_, i) => (
                  <tr key={i} className="border-b">
                    <td className="px-4 py-3"><div className="w-4 h-4 bg-muted animate-pulse rounded" /></td>
                    {Array(5).fill(0).map((_, j) =>
                      <td key={j} className="px-4 py-3"><div className="h-4 bg-muted animate-pulse rounded w-24" /></td>
                    )}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                    {trashItems.length === 0 ? 'Trash is empty' : 'No items match your filter'}
                  </td>
                </tr>
              ) : (
                filtered.map(item => (
                  <tr
                    key={item.id}
                    className={`border-b last:border-0 transition-colors hover:bg-muted/30 ${selectedIds.includes(item.id) ? 'bg-primary/5' : ''}`}
                  >
                    <td className="px-4 py-3"><Checkbox checked={selectedIds.includes(item.id)} onCheckedChange={() => toggleOne(item.id)} /></td>
                    <td className="px-4 py-3"><span className="text-xs bg-muted px-2 py-0.5 rounded-full font-medium">{item.original_entity}</span></td>
                    <td className="px-4 py-3 font-medium">{item.display_name || '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{item.deleted_by || '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{item.deleted_date || '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 justify-end">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs gap-1 text-emerald-600 border-emerald-200 hover:bg-emerald-50"
                          onClick={() => runWithProgress(restoreMutation, [item.id], 'Restoring...')}
                          disabled={restoreMutation.isPending}
                        >
                          <RotateCcw className="w-3 h-3" /> Restore
                        </Button>

                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs gap-1 text-destructive hover:bg-destructive/10"
                          onClick={() => setConfirmAction({ type: 'single', ids: [item.id] })}
                        >
                          <Trash2 className="w-3 h-3" /> Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="px-4 py-2 text-xs text-muted-foreground border-t">
          {filtered.length} item{filtered.length !== 1 ? 's' : ''}
          {selectedIds.length > 0 && ` · ${selectedIds.length} selected`}
        </div>
      </div>

      <ConfirmModal
        open={!!confirmAction}
        onClose={() => setConfirmAction(null)}
        onConfirm={() => {
          const ids = confirmAction.ids;
          setConfirmAction(null);
          runWithProgress(permanentDeleteMutation, ids, 'Deleting permanently...');
        }}
        title={confirmAction?.type === 'empty' ? "Empty Trash" : "Permanently Delete"}
        description={
          confirmAction?.type === 'empty'
            ? `This will permanently delete all ${confirmAction?.ids?.length} items. This cannot be undone.`
            : `Permanently delete ${confirmAction?.ids?.length} item(s)? This cannot be undone.`
        }
        confirmText="Delete Permanently"
        destructive
      />

      <ProgressModal
        open={progress.open}
        title={progress.title || "Processing..."}
        current={progress.current}
        total={progress.total}
      />
    </div>
  );
}
