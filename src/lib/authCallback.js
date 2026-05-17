/**
 * Detect and clear Supabase auth redirects (OAuth sign-in, PKCE code, recovery).
 */

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
