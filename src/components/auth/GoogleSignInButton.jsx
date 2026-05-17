import React, { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/api/supabaseClient";
import { loadGoogleGsiScript } from "@/lib/loadGoogleGsi";
import { GoogleIcon } from "@/components/icons/OAuthBrandIcons";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const BUTTON_CLASS =
  "w-full h-11 gap-2.5 font-medium bg-white hover:bg-slate-50 border-slate-200/90 text-slate-800 shadow-sm dark:bg-card dark:hover:bg-muted/60 dark:text-foreground dark:border-border";

/**
 * Google sign-in via ID token (GIS) → supabase.auth.signInWithIdToken.
 */
export default function GoogleSignInButton({ disabled, loading, onLoadingChange, className }) {
  const clientId = (import.meta.env.VITE_GOOGLE_CLIENT_ID || "").trim();
  const hostRef = useRef(null);
  const gsiMountRef = useRef(null);
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
              'In Supabase → Authentication → Providers → Google, enable "Skip nonce checks".',
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

  const mountGsiButton = useCallback(() => {
    if (!clientId || !hostRef.current || !gsiMountRef.current || !window.google?.accounts?.id) {
      return;
    }

    const width = Math.floor(hostRef.current.getBoundingClientRect().width);
    if (width < 48) return;

    gsiMountRef.current.innerHTML = "";

    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: handleCredential,
      auto_select: false,
      cancel_on_tap_outside: true,
    });

    window.google.accounts.id.renderButton(gsiMountRef.current, {
      type: "standard",
      theme: "outline",
      size: "medium",
      text: "signin_with",
      width,
      logo_alignment: "left",
    });
    setGsiReady(true);
  }, [clientId, handleCredential]);

  useEffect(() => {
    if (!clientId) return;

    let cancelled = false;
    let resizeObserver;

    loadGoogleGsiScript()
      .then(() => {
        if (cancelled) return;
        mountGsiButton();

        if (hostRef.current && typeof ResizeObserver !== "undefined") {
          resizeObserver = new ResizeObserver(() => {
            if (!cancelled) mountGsiButton();
          });
          resizeObserver.observe(hostRef.current);
        }
      })
      .catch((err) => {
        toast.error(err?.message || "Could not load Google sign-in.");
      });

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      if (gsiMountRef.current) gsiMountRef.current.innerHTML = "";
      setGsiReady(false);
    };
  }, [clientId, mountGsiButton]);

  if (!clientId) {
    return (
      <Button
        type="button"
        variant="outline"
        className={cn(BUTTON_CLASS, className)}
        disabled={disabled || loading}
        title="Google sign-in not configured"
        onClick={() =>
          toast.error("Google sign-in not configured", {
            description:
              "Set VITE_GOOGLE_CLIENT_ID in Vercel/env to your Google Cloud Web client ID (same as Supabase → Google).",
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
      className={cn(
        "relative h-11 w-full min-w-0 max-w-full overflow-hidden rounded-md",
        (disabled || loading) && "pointer-events-none opacity-70",
        className
      )}
      aria-busy={loading}
      aria-label="Sign in with Google"
    >
      <Button
        type="button"
        variant="outline"
        tabIndex={-1}
        aria-hidden
        className={cn(BUTTON_CLASS, "pointer-events-none")}
      >
        <GoogleIcon />
        <span>Google</span>
      </Button>

      {/* Transparent Google iframe captures clicks; sized to this column only */}
      <div
        ref={gsiMountRef}
        className={cn(
          "absolute inset-0 z-10 overflow-hidden",
          gsiReady ? "opacity-[0.01]" : "pointer-events-none opacity-0"
        )}
        style={{ maxWidth: "100%" }}
      />

      {loading && (
        <div className="absolute inset-0 z-20 flex items-center justify-center rounded-md bg-background/80">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      )}
    </div>
  );
}
