import React, { useEffect } from "react";
import { supabase, hasPkceCodeVerifier } from "@/api/supabaseClient";
import {
  getAuthCallbackFromUrl,
  clearAuthCallbackFromUrl,
  consumeOAuthStartOrigin,
  supabaseGoogleExchangeFailedMessage,
  pkceVerifierMissingMessage,
} from "@/lib/authCallback";
import { claimInvitationProfile } from "@/lib/applyInviteProfile";
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

function oauthGuardKey(code) {
  return `comfort_oauth_exchange_${code}`;
}

/**
 * Completes Supabase OAuth (Google/Yahoo) on /auth/callback with a single PKCE exchange.
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

      const startOrigin = consumeOAuthStartOrigin();
      if (startOrigin && startOrigin !== window.location.origin) {
        redirectToLogin(
          `Sign-in started on ${startOrigin} but returned on ${window.location.origin}. Use one URL consistently (with or without www).`
        );
        return;
      }

      const callback = getAuthCallbackFromUrl();

      try {
        if (callback?.kind === "pkce") {
          const guardKey = oauthGuardKey(callback.code);
          if (sessionStorage.getItem(guardKey) === "done") {
            window.location.replace("/");
            return;
          }

          if (!hasPkceCodeVerifier()) {
            redirectToLogin(pkceVerifierMissingMessage());
            return;
          }

          sessionStorage.setItem(guardKey, "pending");

          const { error } = await supabase.auth.exchangeCodeForSession(callback.code);
          if (cancelled) return;

          if (error) {
            sessionStorage.removeItem(guardKey);
            if (/unable to exchange external code/i.test(error.message || "")) {
              redirectToLogin(supabaseGoogleExchangeFailedMessage());
              return;
            }
            throw error;
          }

          sessionStorage.setItem(guardKey, "done");
          clearAuthCallbackFromUrl();
          await claimInvitationProfile().catch(() => {});
          window.location.replace("/");
          return;
        }

        if (callback?.kind === "oauth") {
          const { error } = await supabase.auth.setSession({
            access_token: callback.access_token,
            refresh_token: callback.refresh_token,
          });
          if (error) throw error;
          clearAuthCallbackFromUrl();
          await claimInvitationProfile().catch(() => {});
          window.location.replace("/");
          return;
        }

        redirectToLogin(
          "Sign-in callback had no authorization code. Add " +
            `${window.location.origin}/auth/callback under Supabase → Authentication → Redirect URLs.`
        );
      } catch (err) {
        if (cancelled) return;
        redirectToLogin(err?.message || "Social sign-in failed");
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
