import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import { insertTrashItemRow } from "@/lib/trashItemsTable";
import { toast } from "sonner";
import { format } from "date-fns";

export function useSoftDelete({ entityName, tableName, fallbackTableName = null, getDisplayName, invalidateKeys = [], onSuccess }) {
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: async ({ ids, records, onProgress }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const deletedBy = user?.email || 'Unknown';
      const deletedDate = format(new Date(), 'yyyy-MM-dd HH:mm');

      const tryDelete = async (id) => {
        let { error } = await supabase.from(tableName).delete().eq('id', id);
        if (!error) return;
        const msg = String(error.message || '');
        if (fallbackTableName && /schema cache|does not exist|relation|42P01/i.test(msg)) {
          ({ error } = await supabase.from(fallbackTableName).delete().eq('id', id));
        }
        if (error) throw error;
      };

      for (let i = 0; i < ids.length; i++) {
        const id = ids[i];
        const record = records.find(r => r.id === id);
        if (!record) continue;

        // Create trash entry (plural + singular table names; matches Trash Bin list)
        await insertTrashItemRow({
          original_entity: entityName,
          original_id: id,
          data: record,
          deleted_by: deletedBy,
          deleted_date: deletedDate,
          display_name: getDisplayName ? getDisplayName(record) : (record.name || record.bill_number || record.id),
        });

        // Delete original
        await tryDelete(id);

        if (onProgress) onProgress(i + 1, ids.length);
      }
    },
    onSuccess: () => {
      invalidateKeys.forEach(k => qc.invalidateQueries({ queryKey: k }));
      qc.invalidateQueries({ queryKey: ['trash'] });
      toast.success("Moved to Trash");
      if (onSuccess) onSuccess();
    },
    onError: (err) => toast.error(`Delete failed: ${err.message}`),
  });

  return mutation;
}
