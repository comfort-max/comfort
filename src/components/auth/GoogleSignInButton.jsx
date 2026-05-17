import React, { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/api/supabaseClient";
import { loadGoogleGsiScript } from "@/lib/loadGoogleGsi";
import { GoogleIcon } from "@/components/icons/OAuthBrandIcons";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Google sign-in via ID token (GIS) → supabase.auth.signInWithIdToken.
 * Avoids the redirect/PKCE path that fails with "Unable to exchange external code".
 *
 * Requires VITE_GOOGLE_CLIENT_ID = same Web client ID as Supabase → Auth → Google.
 * Google Cloud must list this app under Authorized JavaScript origins (not redirect URIs).
 */
export default function GoogleSignInButton({ disabled, loading, onLoadingChange, className }) {
  const clientId = (import.meta.env.VITE_GOOGLE_CLIENT_ID || "").trim();
  const hostRef = useRef(null);
  const gsiRef = useRef(null);
  const [gsiReady, setGsiReady] = useState(false);

  const handleCredential = useCallback(
    async (response) => {
      if (!response?.credential) {
        toast.error("Google did not return a sign-in token.");
        return;
      }
      onLoadingChange?.(true);
      try {
        const { error } = await supabase.auth.signInWithIdToken({
          provider: "google",
          token: response.credential,
        });
        if (error) throw error;
      } catch (err) {
        const msg = err?.message || "Google sign-in failed";
        if (/nonce/i.test(msg)) {
          toast.error("Google sign-in failed", {
            description:
              'In Supabase → Authentication → Providers → Google, enable "Skip nonce checks", or ensure VITE_GOOGLE_CLIENT_ID matches that provider\'s Client ID.',
            duration: 12000,
          });
        } else {
          toast.error("Google sign-in failed", { description: msg, duration: 10000 });
        }
        onLoadingChange?.(false);
      }
    },
    [onLoadingChange]
  );

  useEffect(() => {
    if (!clientId || !hostRef.current) return;

    let cancelled = false;

    loadGoogleGsiScript()
      .then(() => {
        if (cancelled || !hostRef.current || !window.google?.accounts?.id) return;

        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: handleCredential,
          auto_select: false,
          cancel_on_tap_outside: true,
        });

        gsiRef.current = document.createElement("div");
        gsiRef.current.className = "absolute inset-0 flex items-stretch justify-stretch";
        hostRef.current.appendChild(gsiRef.current);

        const width = Math.max(hostRef.current.offsetWidth, 240);
        window.google.accounts.id.renderButton(gsiRef.current, {
          type: "standard",
          theme: "outline",
          size: "large",
          text: "signin_with",
          width,
          logo_alignment: "left",
        });
        setGsiReady(true);
      })
      .catch((err) => {
        toast.error(err?.message || "Could not load Google sign-in.");
      });

    return () => {
      cancelled = true;
      if (gsiRef.current?.parentNode) {
        gsiRef.current.parentNode.removeChild(gsiRef.current);
      }
      gsiRef.current = null;
    };
  }, [clientId, handleCredential]);

  const visualClass =
    "bg-white hover:bg-slate-50 border-slate-200/90 text-slate-800 shadow-sm dark:bg-card dark:hover:bg-muted/60 dark:text-foreground dark:border-border";

  if (!clientId) {
    return (
      <Button
        type="button"
        variant="outline"
        className={cn("w-full h-11 gap-2.5 font-medium", visualClass, className)}
        disabled={disabled || loading}
        title="Google sign-in not configured"
        onClick={() =>
          toast.error("Google sign-in not configured", {
            description:
              "Set VITE_GOOGLE_CLIENT_ID in Vercel/env to your Google Cloud Web client ID (same value as Supabase → Authentication → Google → Client ID).",
            duration: 12000,
          })
        }
      >
        {loading ? <Loader2 className="w-5 h-5 shrink-0 animate-spin" /> : <GoogleIcon />}
        <span>Google</span>
      </Button>
    );
  }

  return (
    <div
      ref={hostRef}
      className={cn("relative w-full h-11", (disabled || loading) && "pointer-events-none opacity-70", className)}
      aria-busy={loading}
    >
      {!gsiReady && (
        <Button
          type="button"
          variant="outline"
          tabIndex={-1}
          className={cn("w-full h-11 gap-2.5 font-medium pointer-events-none", visualClass)}
        >
          <GoogleIcon />
          <span>Google</span>
        </Button>
      )}
      {loading && (
        <div className="absolute inset-0 z-30 flex items-center justify-center rounded-md bg-background/80">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      )}
    </div>
  );
}
