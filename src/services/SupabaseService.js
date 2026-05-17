import { supabase } from '@/api/supabaseClient';
import { withTrackedAction } from '@/lib/actionProgressDepth';

function isMissingRelationError(error) {
  return (
    error?.code === '42P01' ||
    error?.code === 'PGRST205' ||
    /could not find the table .* in the schema cache/i.test(error?.message || '') ||
    /relation .* does not exist/i.test(error?.message || '')
  );
}

function isMissingColumnError(error) {
  return (
    error?.code === '42703' ||
    error?.code === 'PGRST204' ||
    /column .* does not exist/i.test(error?.message || '') ||
    /could not find the .* column .* in the schema cache/i.test(error?.message || '')
  );
}

function isMissingSalesmanNameColumnError(error) {
  return isMissingColumnError(error) && /salesman_name/i.test(error?.message || '');
}

// Generic CRUD factory for any table
function createEntityService(tableName, fallbackTableName = null) {
  const withTableFallback = async (operation) => {
    const result = await operation(tableName);
    if (!result?.error || !fallbackTableName || !isMissingRelationError(result.error)) {
      return result;
    }
    return operation(fallbackTableName);
  };

  return {
    async list(orderBy = 'created_at', limit = 500) {
      const isDesc = orderBy.startsWith('-');
      const col = isDesc ? orderBy.slice(1) : orderBy;
      let { data, error } = await withTableFallback((table) =>
        supabase
          .from(table)
          .select('*')
          .order(col, { ascending: !isDesc })
          .limit(limit)
      );
      if (error && isMissingColumnError(error)) {
        ({ data, error } = await withTableFallback((table) =>
          supabase
            .from(table)
            .select('*')
            .limit(limit)
        ));
      }
      if (error) throw error;
      return data || [];
    },

    async filter(filters = {}, orderBy = '-created_at', limit = 500) {
      const isDesc = orderBy.startsWith('-');
      const col = isDesc ? orderBy.slice(1) : orderBy;
      let { data, error } = await withTableFallback((table) => {
        let query = supabase.from(table).select('*');
        let includeNullAsActiveStatus = false;
        Object.entries(filters).forEach(([key, value]) => {
          if (key === 'status' && value === 'active') {
            includeNullAsActiveStatus = true;
            return;
          }
          if (value && typeof value === 'object' && value.$in) {
            query = query.in(key, value.$in);
          } else {
            query = query.eq(key, value);
          }
        });
        if (includeNullAsActiveStatus) {
          query = query.or('status.eq.active,status.is.null');
        }
        return query.order(col, { ascending: !isDesc }).limit(limit);
      });
      if (error && isMissingColumnError(error)) {
        ({ data, error } = await withTableFallback((table) => {
          let query = supabase.from(table).select('*');
          let includeNullAsActiveStatus = false;
          Object.entries(filters).forEach(([key, value]) => {
            if (key === 'status' && value === 'active') {
              includeNullAsActiveStatus = true;
              return;
            }
            if (value && typeof value === 'object' && value.$in) {
              query = query.in(key, value.$in);
            } else {
              query = query.eq(key, value);
            }
          });
          if (includeNullAsActiveStatus) {
            query = query.or('status.eq.active,status.is.null');
          }
          return query.limit(limit);
        }));
      }
      if (error) throw error;
      return data || [];
    },

    async get(id) {
      const { data, error } = await withTableFallback((table) =>
        supabase
          .from(table)
          .select('*')
          .eq('id', id)
          .single()
      );
      if (error) throw error;
      return data;
    },

    async create(record) {
      const { data, error } = await withTableFallback((table) =>
        supabase
          .from(table)
          .insert([record])
          .select()
          .single()
      );
      if (error) throw error;
      return data;
    },

    async bulkCreate(records) {
      const { data, error } = await withTableFallback((table) =>
        supabase
          .from(table)
          .insert(records)
          .select()
      );
      if (error) throw error;
      return data;
    },

    async update(id, updates) {
      const { data, error } = await withTableFallback((table) =>
        supabase
          .from(table)
          .update(updates)
          .eq('id', id)
          .select()
          .single()
      );
      if (error) throw error;
      return data;
    },

    async delete(id) {
      const { error } = await withTableFallback((table) =>
        supabase
          .from(table)
          .delete()
          .eq('id', id)
      );
      if (error) throw error;
    },
  };
}

/** company_settings: retry update without unknown columns; surface clear error if display_currency_code is missing in DB. */
function createCompanySettingsService() {
  const inner = createEntityService("company_settings");

  async function update(id, updates) {
    let payload = { ...updates };
    const maxAttempts = Object.keys(payload).length + 1;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const { data, error } = await supabase
        .from("company_settings")
        .update(payload)
        .eq("id", id)
        .select()
        .single();

      if (!error) return data;
      if (!isMissingColumnError(error)) throw error;

      const msg = String(error.message || "");
      const colMatch =
        msg.match(/'([^']+)'\s+column/i) ||
        msg.match(/Could not find the '([^']+)' column/i) ||
        msg.match(/columns?:\s*([a-z_]+)/i);
      const missingCol = colMatch?.[1];

      if (!missingCol || !Object.prototype.hasOwnProperty.call(payload, missingCol)) {
        throw error;
      }
      if (missingCol === "display_currency_code") {
        throw new Error(
          "Display currency could not be saved. In Supabase SQL Editor, run the migration " +
            "supabase/migrations/20260515120000_company_settings_ensure_columns.sql, then save again."
        );
      }

      const { [missingCol]: _removed, ...rest } = payload;
      payload = rest;
    }

    throw new Error("Could not save company settings");
  }

  return {
    ...inner,
    update,
  };
}

/** payment_collection (singular) may lack columns present on payment_collections; retry without salesman_name. */
function createPaymentCollectionService() {
  const inner = createEntityService('payment_collections', 'payment_collection');
  return {
    list: (...a) => inner.list(...a),
    filter: (...a) => inner.filter(...a),
    get: (...a) => inner.get(...a),
    delete: (...a) => inner.delete(...a),
    bulkCreate: (...a) => inner.bulkCreate(...a),
    async create(record) {
      try {
        return await inner.create(record);
      } catch (err) {
        if (!isMissingSalesmanNameColumnError(err) || record == null || typeof record !== 'object') throw err;
        if (!Object.prototype.hasOwnProperty.call(record, 'salesman_name')) throw err;
        const { salesman_name, ...rest } = record;
        return await inner.create(rest);
      }
    },
    async update(id, updates) {
      try {
        return await inner.update(id, updates);
      } catch (err) {
        if (!isMissingSalesmanNameColumnError(err) || updates == null || typeof updates !== 'object') throw err;
        if (!Object.prototype.hasOwnProperty.call(updates, 'salesman_name')) throw err;
        const { salesman_name, ...rest } = updates;
        if (Object.keys(rest).length === 0) throw err;
        return await inner.update(id, rest);
      }
    },
  };
}

// All entities mapped to Supabase table names
export const db = {
  Bill:                createEntityService('bills', 'bill'),
  BillItem:            createEntityService('bill_items', 'bill_item'),
  Customer:            createEntityService('customer', 'customers'),
  Employee:            createEntityService('employees', 'employee'),
  Vendor:              createEntityService('vendors', 'vendor'),
  VendorOrder:         createEntityService('vendor_orders', 'vendor_order'),
  VendorBilling:       createEntityService('vendor_billings', 'vendor_billing'),
  VendorRate:          createEntityService('vendor_rates', 'vendor_rate'),
  PaymentCollection:   createPaymentCollectionService(),
  Expense:             createEntityService('expenses', 'expense'),
  ExpenseCategory:     createEntityService('expense_categories', 'expense_category'),
  SalaryRecord:        createEntityService('salary_records', 'salary_record'),
  IncentiveSlab:       createEntityService('incentive_slabs', 'incentive_slab'),
  RateListItem:        createEntityService('rate_list_items', 'rate_list_item'),
  CompanySettings:     createCompanySettingsService(),
  PaymentMethod:       createEntityService('payment_methods', 'payment_method'),
  AppRole:             createEntityService('app_roles', 'app_role'),
  ReminderLog:         createEntityService('reminder_logs', 'reminder_log'),
  CommunicationTemplate: createEntityService('communication_templates', 'communication_template'),
  TrashItem:           createEntityService('trash_items', 'trash_item'),
  Invitation:          createEntityService('invitations', 'invitation'),
  // profiles = users table (managed by Supabase Auth)
  profiles: {
    async list() {
      const { data, error } = await supabase.from('profiles').select('*');
      if (error) throw error;
      return data || [];
    },
    async update(id, updates) {
      let payload = { ...updates };
      let { data, error } = await supabase.from('profiles').update(payload).eq('id', id).select().single();
      if (error && isMissingColumnError(error) && /phone/i.test(String(error.message || ''))) {
        const { phone: _p, ...rest } = payload;
        ({ data, error } = await supabase.from('profiles').update(rest).eq('id', id).select().single());
      }
      if (error) throw error;
      return data;
    },
  },
};

// File upload utility — stores canonical public URL in DB (works when bucket is public).
// For private buckets, use getComfortFilesDisplayUrl() wherever the image is shown or fetched.
export async function uploadFile(file) {
  return withTrackedAction(async () => {
    const safeName = String(file.name || 'file').replace(/[^\w.\-()+ ]/g, '_');
    const fileName = `${Date.now()}-${safeName}`;
    const { error } = await supabase.storage
      .from('comfort-files')
      .upload(fileName, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type || undefined,
      });
    if (error) {
      const msg = error.message || '';
      if (/bucket not found/i.test(msg)) {
        throw new Error(
          'Storage bucket "comfort-files" is missing. Run supabase/migrations/20260520100000_comfort_files_storage.sql in the Supabase SQL Editor.'
        );
      }
      throw error;
    }
    const { data: urlData } = supabase.storage
      .from('comfort-files')
      .getPublicUrl(fileName);
    return { file_url: urlData.publicUrl };
  });
}

/**
 * Object path inside bucket `comfort-files` from a Supabase public object URL.
 */
export function extractComfortFilesObjectPath(url) {
  if (!url || typeof url !== "string") return null;
  const marker = "/object/public/comfort-files/";
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  const rawPath = url.slice(idx + marker.length).split(/[?#]/)[0];
  try {
    return decodeURIComponent(rawPath);
  } catch {
    return rawPath;
  }
}

/**
 * Download file with current Supabase client (anon or authed) and return a temporary object URL.
 * Caller must call URL.revokeObjectURL when done.
 */
export async function downloadComfortFileAsObjectUrl(publicObjectUrl) {
  const objectPath = extractComfortFilesObjectPath(publicObjectUrl);
  if (!objectPath) return null;
  const { data, error } = await supabase.storage.from("comfort-files").download(objectPath);
  if (error || !data) return null;
  return URL.createObjectURL(data);
}

/**
 * Resolves a stored logo/storage URL for display (private buckets: signed URL, or blob from download).
 * Returns blob:/data: unchanged.
 */
export async function getComfortFilesDisplayUrl(url) {
  if (!url || url.startsWith("blob:") || url.startsWith("data:")) return url;
  const objectPath = extractComfortFilesObjectPath(url);
  if (!objectPath) return url;

  const { data, error } = await supabase.storage
    .from("comfort-files")
    .createSignedUrl(objectPath, 60 * 60 * 24 * 30);
  if (!error && data?.signedUrl) return data.signedUrl;

  return url;
}

// Email sender — Vercel `/api/email/send` or local `server/emailServer.js` (see vite proxy)
export async function sendEmail({ to, subject, body, fromName }) {
  const base = (import.meta.env.VITE_EMAIL_SERVER_URL || '').replace(/\/$/, '') || '/api/email';
  const url = `${base}/send`;
  const headers = { 'Content-Type': 'application/json' };
  const secret = import.meta.env.VITE_SERVER_SECRET;
  if (secret) headers['x-server-secret'] = secret;
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ to, subject, body, fromName }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to send email');
  }
  return res.json();
}

/** Admin-only: invitation email via `/api/admin/invite` (Vercel or local email server). Optionally use Supabase Edge Function when `VITE_INVITE_USE_SUPABASE_EDGE=true`. */
export async function sendAdminInvite(payload) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Not signed in');
  const body = JSON.stringify({
    ...payload,
    app_url: typeof window !== 'undefined' ? window.location.origin : payload.app_url,
  });

  const useEdge = import.meta.env.VITE_INVITE_USE_SUPABASE_EDGE === 'true';
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  const supabaseUrl = String(import.meta.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
  const edgeUrl = supabaseUrl ? `${supabaseUrl}/functions/v1/admin-invite` : null;

  if (useEdge && edgeUrl && anonKey) {
    const edgeHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
      apikey: anonKey,
    };
    try {
      const res = await fetch(edgeUrl, { method: 'POST', headers: edgeHeaders, body });
      const json = await res.json().catch(() => ({}));
      if (res.ok) return json;
      if (res.status !== 404) {
        throw new Error(json.error || `Invite failed (${res.status})`);
      }
    } catch (e) {
      if (!(e instanceof TypeError)) throw e;
    }
  }

  const res = await fetch('/api/admin/invite', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Invite failed');
  return json;
}

/** Admin-only: permanently delete a user (auth account + profile). */
export async function deleteAdminUser(userId) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Not signed in");
  if (!userId) throw new Error("user_id is required");

  const res = await fetch("/api/admin/delete-user", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ user_id: userId }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "Delete user failed");
  return json;
}

/** Notify administrators to review this user's role (access denied screen). */
export async function sendAccessRequestToAdmins() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Not signed in');

  const res = await fetch('/api/access-request-notify', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      app_url: typeof window !== 'undefined' ? window.location.origin : '',
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Could not send access request');
  return json;
}