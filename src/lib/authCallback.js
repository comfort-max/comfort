/**
 * Detect and clear Supabase auth redirects (OAuth sign-in, PKCE code, recovery).
 */

import { getSupabaseOAuthCallbackUrl, getSupabaseProjectRef } from "@/api/supabaseClient";

const OAUTH_START_ORIGIN_KEY = "comfort_oauth_start_origin";

export function rememberOAuthStartOrigin() {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(OAUTH_START_ORIGIN_KEY, window.location.origin);
}

export function consumeOAuthStartOrigin() {
  if (typeof window === "undefined") return null;
  const origin = sessionStorage.getItem(OAUTH_START_ORIGIN_KEY);
  sessionStorage.removeItem(OAUTH_START_ORIGIN_KEY);
  return origin;
}

/**
 * Shown when Supabase returns "Unable to exchange external code" during PKCE completion.
 * That means Supabase could not trade Google's code for tokens — usually credentials or consent, not app redirect URLs.
 */
export function supabaseGoogleExchangeFailedMessage() {
  const ref = getSupabaseProjectRef();
  const lines = [
    "Google sign-in reached your app, but Supabase could not finish the Google token exchange.",
    "",
    "Check these (even when redirect URIs look correct):",
    "• Supabase → Authentication → Providers → Google: Client ID and Client Secret must be copied again from the same Google Cloud “Web application” OAuth client (secret typos are common).",
    "• Google Cloud → OAuth consent screen: if status is “Testing”, your Google account must be listed under Test users.",
    "• Google Cloud → Credentials: use a “Web application” client, not Desktop/iOS.",
    `• This deployment's VITE_SUPABASE_URL must be the same Supabase project where Google is enabled${ref ? ` (expected ref: ${ref})` : ""}.`,
    `• Google Authorized redirect URI must include ${getSupabaseOAuthCallbackUrl() || "https://<ref>.supabase.co/auth/v1/callback"} only — not your app's /auth/callback.`,
    "• Retry once in a single tab; don't refresh the callback URL.",
  ];
  return lines.join("\n");
}

export function pkceVerifierMissingMessage() {
  return [
    "Sign-in could not finish: the browser lost the PKCE verifier (localStorage).",
    "Use one tab, avoid private mode, and start and finish on the same site URL (www vs non-www must match).",
    "Then click Sign in with Google again from the login page.",
  ].join(" ");
}

export function hasOnlyOAuthIdentities(user) {
  const identities = user?.identities ?? [];
  if (!identities.length) return false;
  return identities.every((i) => i.provider !== "email");
}

/** True when the user should be prompted to set/change a password (not OAuth-only). */
export function shouldPromptForPassword(user) {
  if (!user) return false;
  return !hasOnlyOAuthIdentities(user);
}

export function getAuthCallbackFromUrl(href = typeof window !== "undefined" ? window.location.href : "") {
  if (!href) return null;

  const url = new URL(href);
  const code = url.searchParams.get("code");
  if (code) {
    // PKCE password-reset emails land on /auth/reset-password; OAuth lands on /login (or /).
    if (url.pathname === "/auth/reset-password") {
      return { kind: "recovery", code };
    }
    return { kind: "pkce", code };
  }

  const hash = url.hash?.replace(/^#/, "") || "";
  if (!hash) return null;

  const params = new URLSearchParams(hash);
  const access_token = params.get("access_token");
  const refresh_token = params.get("refresh_token");
  if (!access_token || !refresh_token) return null;

  const type = params.get("type");
  if (type === "recovery") {
    return { kind: "recovery", access_token, refresh_token };
  }

  return { kind: "oauth", access_token, refresh_token };
}

export function isRecoveryCallbackUrl(href) {
  return getAuthCallbackFromUrl(href)?.kind === "recovery";
}

/** True while URL still carries OAuth/PKCE tokens that must be exchanged before routing. */
export function isPendingAuthCallbackUrl(href) {
  const cb = getAuthCallbackFromUrl(href);
  return cb?.kind === "pkce" || cb?.kind === "oauth";
}

export function clearAuthCallbackFromUrl() {
  if (typeof window === "undefined") return;
  window.history.replaceState(null, "", window.location.pathname);
}

/** Apply implicit OAuth hash tokens (PKCE is handled on /auth/callback). */
export async function completeAuthCallbackFromUrl(supabase) {
  const callback = getAuthCallbackFromUrl();
  if (!callback) return { error: null };

  if (callback.kind === "oauth") {
    const { error } = await supabase.auth.setSession({
      access_token: callback.access_token,
      refresh_token: callback.refresh_token,
    });
    if (!error) clearAuthCallbackFromUrl();
    return { error };
  }

  return { error: null };
}
