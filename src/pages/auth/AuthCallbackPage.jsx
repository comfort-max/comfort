import React, { useEffect } from "react";
import { supabase } from "@/api/supabaseClient";
import { getAuthCallbackFromUrl, clearAuthCallbackFromUrl } from "@/lib/authCallback";
import { Loader2 } from "lucide-react";

const AUTH_ERROR_KEY = "comfort_auth_error";

export function consumeAuthErrorMessage() {
  const msg = sessionStorage.getItem(AUTH_ERROR_KEY);
  if (msg) sessionStorage.removeItem(AUTH_ERROR_KEY);
  return msg;
}

function redirectToLogin(message) {
  if (message) sessionStorage.setItem(AUTH_ERROR_KEY, message);
  window.location.replace("/login");
}

/**
 * Supabase OAuth (Google/Yahoo) returns here with ?code= (PKCE) or #access_token= (implicit).
 * Finishes sign-in then hard-navigates to / so AuthContext loads a persisted session.
 */
export default function AuthCallbackPage() {
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const url = new URL(window.location.href);
      const oauthError =
        url.searchParams.get("error_description") || url.searchParams.get("error");
      if (oauthError) {
        redirectToLogin(oauthError);
        return;
      }

      const callback = getAuthCallbackFromUrl();

      try {
        if (callback?.kind === "pkce") {
          const { error } = await supabase.auth.exchangeCodeForSession(callback.code);
          if (error) throw error;
          clearAuthCallbackFromUrl();
        } else if (callback?.kind === "oauth") {
          const { error } = await supabase.auth.setSession({
            access_token: callback.access_token,
            refresh_token: callback.refresh_token,
          });
          if (error) throw error;
          clearAuthCallbackFromUrl();
        } else {
          redirectToLogin(
            "Sign-in callback was missing authorization data. Add this URL under Supabase → Authentication → Redirect URLs: " +
              `${window.location.origin}/auth/callback`
          );
          return;
        }

        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (cancelled) return;
        if (sessionError) throw sessionError;
        if (!session?.user) {
          throw new Error("Sign-in completed but no session was stored. Try again or use email/password.");
        }

        window.location.replace("/");
      } catch (err) {
        if (cancelled) return;
        const msg = err?.message || "Social sign-in failed";
        redirectToLogin(msg);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-background p-6">
      <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      <p className="text-sm text-muted-foreground">Completing sign-in…</p>
    </div>
  );
}
