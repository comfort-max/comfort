import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    flowType: "pkce",
    // Exchange runs once on /auth/callback — avoids double PKCE exchange races.
    detectSessionInUrl: false,
    persistSession: true,
    autoRefreshToken: true,
    storage: typeof window !== "undefined" ? window.localStorage : undefined,
  },
});

/** Matches Supabase JS default: sb-<project-ref>-auth-token */
export function getAuthStorageKey() {
  if (!SUPABASE_URL) return null;
  try {
    const ref = new URL(SUPABASE_URL).hostname.split(".")[0];
    return ref ? `sb-${ref}-auth-token` : null;
  } catch {
    return null;
  }
}

export function hasPkceCodeVerifier() {
  if (typeof window === "undefined") return false;
  const base = getAuthStorageKey();
  if (!base) return false;
  const raw = window.localStorage.getItem(`${base}-code-verifier`);
  return Boolean(raw && String(raw).trim());
}

/** e.g. "abcdefghijklmnop" from https://abcdefghijklmnop.supabase.co */
export function getSupabaseProjectRef() {
  const url = SUPABASE_URL || "";
  const match = url.match(/https:\/\/([^.]+)\.supabase\.co/i);
  return match?.[1] || null;
}

export function getSupabaseOAuthCallbackUrl() {
  const ref = getSupabaseProjectRef();
  return ref ? `https://${ref}.supabase.co/auth/v1/callback` : null;
}