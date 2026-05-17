/**
 * Build-time: bake company logo into public/icons for offline SW precache + fallback.
 * Uses SUPABASE_SERVICE_ROLE_KEY or VITE_COMPANY_LOGO_URL (same as runtime branding).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const iconsDir = path.join(__dirname, "../public/icons");

function extractComfortFilesObjectPath(url) {
  if (!url) return null;
  for (const marker of ["/object/public/comfort-files/", "/comfort-files/"]) {
    const idx = url.indexOf(marker);
    if (idx !== -1) {
      const raw = url.slice(idx + marker.length).split(/[?#]/)[0];
      try {
        return decodeURIComponent(raw);
      } catch {
        return raw;
      }
    }
  }
  return null;
}

async function fetchCompanyLogoUrl() {
  const envLogo = (process.env.VITE_COMPANY_LOGO_URL || process.env.PWA_LOGO_URL || "").trim();
  if (envLogo) return envLogo;

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;

  const admin = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  for (const table of ["company_settings", "company_setting"]) {
    const { data, error } = await admin.from(table).select("logo_url").limit(1);
    if (error) continue;
    const row = Array.isArray(data) ? data[0] : data;
    if (row?.logo_url) return String(row.logo_url).trim();
  }
  return null;
}

async function loadLogoBuffer(logoUrl) {
  const objectPath = extractComfortFilesObjectPath(logoUrl);
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (objectPath && url && key) {
    const admin = createClient(url, key);
    const { data, error } = await admin.storage.from("comfort-files").download(objectPath);
    if (!error && data) return Buffer.from(await data.arrayBuffer());
  }

  if (logoUrl.includes("/object/public/comfort-files/")) {
    const res = await fetch(logoUrl);
    if (res.ok) return Buffer.from(await res.arrayBuffer());
  }

  const res = await fetch(logoUrl, { redirect: "follow" });
  if (!res.ok) throw new Error(`Could not fetch logo (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  fs.mkdirSync(iconsDir, { recursive: true });

  const logoUrl = await fetchCompanyLogoUrl();
  if (!logoUrl) {
    console.warn("[sync-pwa-icons] No company logo found — keeping placeholder icons.");
    return;
  }

  let sharp;
  try {
    sharp = (await import("sharp")).default;
  } catch {
    console.warn("[sync-pwa-icons] sharp not installed — run: npm install -D sharp");
    return;
  }

  const buffer = await loadLogoBuffer(logoUrl);
  const themeBg = { r: 42, g: 122, b: 140, alpha: 1 };
  const lightBg = { r: 248, g: 250, b: 252, alpha: 1 };

  await sharp(buffer)
    .resize(192, 192, { fit: "contain", background: lightBg })
    .png()
    .toFile(path.join(iconsDir, "pwa-192.png"));

  await sharp(buffer)
    .resize(512, 512, { fit: "contain", background: lightBg })
    .png()
    .toFile(path.join(iconsDir, "pwa-512.png"));

  const inner = Math.round(512 * 0.8);
  await sharp(buffer)
    .resize(inner, inner, { fit: "contain", background: themeBg })
    .extend({
      top: Math.floor((512 - inner) / 2),
      bottom: Math.ceil((512 - inner) / 2),
      left: Math.floor((512 - inner) / 2),
      right: Math.ceil((512 - inner) / 2),
      background: themeBg,
    })
    .png()
    .toFile(path.join(iconsDir, "pwa-maskable-512.png"));

  const manifest = {
    name: "COMFORT Laundry",
    short_name: "COMFORT",
    description: "COMFORT Laundry Management System",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#f8fafc",
    theme_color: "#2a7a8c",
    categories: ["business", "productivity"],
    icons: [
      { src: "/icons/pwa-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/pwa-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/pwa-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };

  fs.writeFileSync(
    path.join(__dirname, "../public/manifest.webmanifest"),
    `${JSON.stringify(manifest, null, 2)}\n`
  );

  console.log("[sync-pwa-icons] Wrote PWA icons from company logo.");
}

main().catch((e) => {
  console.warn("[sync-pwa-icons]", e?.message || e);
  process.exit(0);
});
