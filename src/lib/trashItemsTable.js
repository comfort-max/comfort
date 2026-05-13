import { supabase } from "@/lib/supabaseClient";

const TRASH_TABLES = ["trash_items", "trash_item"];

function isMissingRelationError(error) {
  return (
    error?.code === "42P01" ||
    error?.code === "PGRST205" ||
    /could not find the table .* in the schema cache/i.test(error?.message || "") ||
    /relation .* does not exist/i.test(error?.message || "")
  );
}

function isMissingColumnError(error) {
  return (
    error?.code === "42703" ||
    error?.code === "PGRST204" ||
    /column .* does not exist/i.test(error?.message || "") ||
    /could not find the .* column .* in the schema cache/i.test(error?.message || "")
  );
}

/**
 * Insert one trash snapshot row; tries plural then singular physical table names.
 * @param {Record<string, unknown>} row
 */
export async function insertTrashItemRow(row) {
  let lastErr = null;
  for (const table of TRASH_TABLES) {
    const { error } = await supabase.from(table).insert(row);
    if (!error) return;
    lastErr = error;
    if (isMissingRelationError(error) && table === TRASH_TABLES[0]) continue;
    throw error;
  }
  if (lastErr) throw lastErr;
}

/**
 * Permanently delete one trash row by id (tries plural then singular table names).
 * @param {string} id
 */
export async function deleteTrashItemRowById(id) {
  let lastErr = null;
  for (const table of TRASH_TABLES) {
    const { error } = await supabase.from(table).delete().eq("id", id);
    if (!error) return;
    lastErr = error;
    if (isMissingRelationError(error) && table === TRASH_TABLES[0]) continue;
    throw error;
  }
  if (lastErr) throw lastErr;
}

/**
 * List trash for the Trash Bin UI: newest-first (by deleted_date when present) and higher limit.
 * @param {number} [limit]
 */
export async function listTrashItemsForBin(limit = 3000) {
  const orderCols = ["deleted_date", "created_at", "created_date"];

  for (const table of TRASH_TABLES) {
    let gotRelationError = false;
    for (const col of orderCols) {
      const { data, error } = await supabase
        .from(table)
        .select("*")
        .order(col, { ascending: false })
        .limit(limit);
      if (!error) {
        return data || [];
      }
      if (isMissingColumnError(error)) continue;
      if (isMissingRelationError(error)) {
        gotRelationError = true;
        break;
      }
      throw error;
    }
    if (gotRelationError) {
      continue;
    }

    const { data, error } = await supabase.from(table).select("*").limit(limit);
    if (!error) return data || [];
    if (isMissingRelationError(error) && table === TRASH_TABLES[0]) continue;
    if (error) throw error;
  }

  return [];
}
