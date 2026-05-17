import { createClient } from "@supabase/supabase-js";

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Extract object path inside bucket `comfort-files` from a storage URL. */
export function extractComfortFilesObjectPath(url) {
  if (!url || typeof url !== "string") return null;
  const publicMarker = "/object/public/comfort-files/";
  let idx = url.indexOf(publicMarker);
  if (idx !== -1) {
    const raw = url.slice(idx + publicMarker.length).split(/[?#]/)[0];
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }
  const generic = "/comfort-files/";
  idx = url.indexOf(generic);
  if (idx !== -1) {
    const raw = url.slice(idx + generic.length).split(/[?#]/)[0];
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }
  return null;
}

export async function fetchCompanyLogoUrl() {
  const envLogo = (process.env.VITE_COMPANY_LOGO_URL || process.env.PWA_LOGO_URL || "").trim();
  if (envLogo) return envLogo;

  const admin = getSupabaseAdmin();
  if (!admin) return null;

  for (const table of ["company_settings", "company_setting"]) {
    const { data, error } = await admin.from(table).select("logo_url").limit(1);
    if (error) continue;
    const row = Array.isArray(data) ? data[0] : data;
    if (row?.logo_url) return String(row.logo_url).trim();
  }
  return null;
}

/** Long-lived signed URL or public URL suitable for PWA manifest icons. */
export async function resolvePwaLogoUrl() {
  const raw = await fetchCompanyLogoUrl();
  if (!raw) return null;

  if (raw.startsWith("data:") || raw.startsWith("blob:")) return null;

  const objectPath = extractComfortFilesObjectPath(raw);
  const admin = getSupabaseAdmin();
  if (objectPath && admin) {
    const { data, error } = await admin.storage
      .from("comfort-files")
      .createSignedUrl(objectPath, 60 * 60 * 24 * 365);
    if (!error && data?.signedUrl) return data.signedUrl;

    const { data: file, error: dlErr } = await admin.storage.from("comfort-files").download(objectPath);
    if (!dlErr && file) {
      return { buffer: Buffer.from(await file.arrayBuffer()), mime: file.type || "image/png" };
    }
  }

  if (raw.includes("/object/public/comfort-files/")) return raw;

  try {
    const res = await fetch(raw, { redirect: "follow" });
    if (!res.ok) return raw;
    const buffer = Buffer.from(await res.arrayBuffer());
    const mime = res.headers.get("content-type") || "image/png";
    return { buffer, mime };
  } catch {
    return raw;
  }
}

export async function fetchLogoImageBytes() {
  const resolved = await resolvePwaLogoUrl();
  if (!resolved) return null;
  if (typeof resolved === "string") {
    const res = await fetch(resolved, { redirect: "follow" });
    if (!res.ok) return null;
    return {
      buffer: Buffer.from(await res.arrayBuffer()),
      mime: res.headers.get("content-type") || "image/png",
    };
  }
  return resolved;
}
