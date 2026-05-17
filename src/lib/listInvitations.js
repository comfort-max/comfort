import { supabase } from "@/api/supabaseClient";

function isMissingRelationError(error) {
  return (
    error?.code === "42P01" ||
    error?.code === "PGRST205" ||
    /schema cache|does not exist|relation/i.test(error?.message || "")
  );
}

function isMissingColumnError(error) {
  return (
    error?.code === "42703" ||
    error?.code === "PGRST204" ||
    /column .* does not exist/i.test(error?.message || "")
  );
}

async function listFromTable(table) {
  const orderCols = ["created_date", "created_at", "id"];
  for (const col of orderCols) {
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .order(col, { ascending: false })
      .limit(500);
    if (!error) return data || [];
    if (isMissingColumnError(error)) continue;
    throw error;
  }
  const { data, error } = await supabase.from(table).select("*").limit(500);
  if (error) throw error;
  return data || [];
}

/** List invitations for admin UI (tries plural then singular table). */
export async function listInvitations() {
  for (const table of ["invitations", "invitation"]) {
    try {
      return await listFromTable(table);
    } catch (err) {
      if (isMissingRelationError(err)) continue;
      throw err;
    }
  }
  return [];
}
