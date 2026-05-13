import { supabase } from "@/api/supabaseClient";

/**
 * Core reference tables — full export when "Include master data" is checked.
 * `profiles` / `invitations` / logs are optional (see includeExtendedPublicData).
 */
const CORE_MASTER_TABLE_ORDER = [
  "company_settings",
  "app_roles",
  "expense_categories",
  "payment_methods",
  "rate_list_items",
  "incentive_slabs",
  "communication_templates",
  "customers",
  "employees",
  "vendors",
  "vendor_rates",
];

/**
 * Full import order (FK-safe). `profiles` / `invitations` are only present in backup files when
 * extended public data was exported; import skips missing tables.
 */
export const MASTER_TABLE_ORDER = [
  ...CORE_MASTER_TABLE_ORDER,
  "invitations",
  "profiles",
];

/** Transactional tables (date-filtered). Import order respects FKs. */
export const BACKUP_TABLE_ORDER = [
  "bills",
  "vendor_orders",
  "vendor_billings",
  "bill_items",
  "payment_collections",
  "expenses",
  "salary_records",
];

/** Logs / soft-delete archive — imported after transactional rows (no FK into bills). */
export const POST_TRANSACTION_TABLE_ORDER = ["reminder_logs", "trash_items"];

const TABLE_DATE_FIELD = {
  bills: "bill_date",
  vendor_orders: "order_date",
  vendor_billings: "date",
  bill_items: null,
  payment_collections: "date",
  expenses: "date",
  salary_records: "created_date",
};

const EXTENDED_TABLE_DATE_FIELD = {
  invitations: "created_date",
  reminder_logs: "sent_date",
};

const PAGE_SIZE = 1000;

async function fetchPaged(table, buildQuery) {
  const rows = [];
  let from = 0;
  for (;;) {
    let q = supabase.from(table).select("*");
    q = buildQuery(q);
    const { data, error } = await q.range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return rows;
}

async function fetchAllRowsOrderedById(table) {
  return fetchPaged(table, (q) => q.order("id", { ascending: true }));
}

/** Empty result when the table is missing (older DBs); rethrow other errors. */
async function fetchPagedOrEmpty(table, buildQuery) {
  try {
    return await fetchPaged(table, buildQuery);
  } catch (e) {
    const msg = String(e?.message || e);
    if (/relation|does not exist|schema cache/i.test(msg)) return [];
    throw e;
  }
}

/**
 * Profiles: filter by first available timestamp column; if none, export all rows (see metadata on payload).
 * @returns {{ rows: object[], profilesDateFilter: string | null }}
 */
async function fetchProfilesForDateRange(dateFrom, dateTo) {
  try {
    const from = `${dateFrom}T00:00:00.000Z`;
    const to = `${dateTo}T23:59:59.999Z`;
    for (const field of ["updated_at", "created_at"]) {
      try {
        const rows = await fetchPaged("profiles", (q) =>
          q.gte(field, from).lte(field, to).order("id", { ascending: true })
        );
        return { rows, profilesDateFilter: field };
      } catch (e) {
        const msg = String(e?.message || e);
        if (/column|Could not find|PGRST204|schema cache/i.test(msg)) continue;
        throw e;
      }
    }
    const rows = await fetchAllRowsOrderedById("profiles");
    return { rows, profilesDateFilter: null };
  } catch (e) {
    const msg = String(e?.message || e);
    if (/relation|does not exist|schema cache/i.test(msg)) {
      return { rows: [], profilesDateFilter: null };
    }
    throw e;
  }
}

/**
 * @param {string} dateFrom
 * @param {string} dateTo
 * @param {{ includeMasterData?: boolean, includeExtendedPublicData?: boolean }} [options]
 */
export async function exportTransactionBackup(dateFrom, dateTo, options = {}) {
  const includeMasterData = !!options.includeMasterData;
  const includeExtendedPublicData = !!options.includeExtendedPublicData;

  const bills = await fetchPaged("bills", (q) =>
    q.gte("bill_date", dateFrom).lte("bill_date", dateTo).order("bill_date", { ascending: true })
  );
  const billIds = [...new Set(bills.map((b) => b.id).filter(Boolean))];
  const billItems = [];
  const chunk = 80;
  for (let i = 0; i < billIds.length; i += chunk) {
    const slice = billIds.slice(i, i + chunk);
    if (slice.length === 0) continue;
    const part = await fetchPaged("bill_items", (q) => q.in("bill_id", slice).order("created_date", { ascending: true }));
    billItems.push(...part);
  }

  const tables = { bills, bill_items: billItems };
  for (const table of BACKUP_TABLE_ORDER) {
    if (table === "bills" || table === "bill_items") continue;
    const dateField = TABLE_DATE_FIELD[table];
    if (!dateField) continue;
    tables[table] = await fetchPaged(table, (q) =>
      q.gte(dateField, dateFrom).lte(dateField, dateTo).order(dateField, { ascending: true })
    );
  }

  if (includeMasterData) {
    for (const table of CORE_MASTER_TABLE_ORDER) {
      tables[table] = await fetchAllRowsOrderedById(table);
    }
  }

  let profilesDateFilter;
  if (includeExtendedPublicData) {
    const prof = await fetchProfilesForDateRange(dateFrom, dateTo);
    tables.profiles = prof.rows;
    profilesDateFilter = prof.profilesDateFilter;

    for (const table of ["invitations", "reminder_logs"]) {
      const dateField = EXTENDED_TABLE_DATE_FIELD[table];
      tables[table] = await fetchPagedOrEmpty(table, (q) =>
        q.gte(dateField, dateFrom).lte(dateField, dateTo).order(dateField, { ascending: true })
      );
    }

    const trashFrom = `${dateFrom} 00:00`;
    const trashTo = `${dateTo} 23:59`;
    tables.trash_items = await fetchPagedOrEmpty("trash_items", (q) =>
      q.gte("deleted_date", trashFrom).lte("deleted_date", trashTo).order("deleted_date", { ascending: true })
    );
  }

  return {
    format: "comfort_laundry_backup",
    version: 3,
    includeMasterData,
    includeExtendedPublicData,
    ...(includeExtendedPublicData && {
      profilesDateFilter,
      profilesExportNote:
        profilesDateFilter == null
          ? "All profile rows exported (no updated_at/created_at column matched for date filter)."
          : undefined,
    }),
    exportedAt: new Date().toISOString(),
    dateFrom,
    dateTo,
    tables,
  };
}

function sanitizeRow(row) {
  if (!row || typeof row !== "object") return row;
  const { ...rest } = row;
  return rest;
}

async function upsertTableChunks(table, rows, summary) {
  if (!Array.isArray(rows) || rows.length === 0) {
    summary.push({ table, count: 0, skipped: true });
    return;
  }
  const cleaned = rows.map(sanitizeRow);
  const CHUNK = 150;
  for (let i = 0; i < cleaned.length; i += CHUNK) {
    const slice = cleaned.slice(i, i + CHUNK);
    const { error } = await supabase.from(table).upsert(slice, { onConflict: "id" });
    if (error) throw new Error(`${table}: ${error.message}`);
  }
  summary.push({ table, count: cleaned.length });
}

/**
 * Upsert rows in FK-safe order. Master tables import first when present in the file.
 */
export async function importTransactionBackup(payload) {
  if (!payload || payload.format !== "comfort_laundry_backup" || !payload.tables || typeof payload.tables !== "object") {
    throw new Error('Invalid backup file: expected format "comfort_laundry_backup" with a tables object.');
  }

  const { tables } = payload;
  const summary = [];

  for (const table of MASTER_TABLE_ORDER) {
    await upsertTableChunks(table, tables[table], summary);
  }
  for (const table of BACKUP_TABLE_ORDER) {
    await upsertTableChunks(table, tables[table], summary);
  }
  for (const table of POST_TRANSACTION_TABLE_ORDER) {
    await upsertTableChunks(table, tables[table], summary);
  }

  return summary;
}
