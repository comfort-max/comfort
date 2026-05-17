/**
 * Detect and clear Supabase auth redirects (OAuth sign-in, PKCE code, recovery).
 */

export function getAuthCallbackFromUrl(href = typeof window !== "undefined" ? window.location.href : "") {
  if (!href) return null;

  const url = new URL(href);
  const code = url.searchParams.get("code");
  if (code) {
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

/** Apply PKCE code or implicit OAuth tokens from the current URL. */
export async function completeAuthCallbackFromUrl(supabase) {
  const callback = getAuthCallbackFromUrl();
  if (!callback) return { error: null };

  if (callback.kind === "pkce") {
    const { error } = await supabase.auth.exchangeCodeForSession(callback.code);
    if (!error) clearAuthCallbackFromUrl();
    return { error };
  }

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
