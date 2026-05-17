import React, { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { useCompanyBranding } from "@/hooks/useCompanyBranding";
import { CompanyLogoMark } from "@/components/shared/CompanyLogoMark";
import { supabase } from "@/api/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { LOGIN_OAUTH_PROVIDERS, SOCIAL_LOGIN_NAMES } from "@/lib/oauthProviders";
import { isPendingAuthCallbackUrl, isRecoveryCallbackUrl, rememberOAuthStartOrigin } from "@/lib/authCallback";
import { consumeAuthErrorMessage } from "@/pages/auth/AuthCallbackPage";
import { YahooIcon } from "@/components/icons/OAuthBrandIcons";
import GoogleSignInButton from "@/components/auth/GoogleSignInButton";

const RESET_EMAIL_COOLDOWN_MS = 90_000;

function resetCooldownKey(email) {
  return `comfort_pw_reset_last_${String(email).trim().toLowerCase()}`;
}

function msUntilResetAllowed(email) {
  const raw = sessionStorage.getItem(resetCooldownKey(email));
  const last = raw ? Number(raw) : 0;
  if (!last) return 0;
  return Math.max(0, RESET_EMAIL_COOLDOWN_MS - (Date.now() - last));
}

function markResetEmailSent(email) {
  sessionStorage.setItem(resetCooldownKey(email), String(Date.now()));
}

export default function LoginPage() {
  const { login, isAuthenticated, isLoadingAuth } = useAuth();
  const { companyName, resolvedLogoSrc } = useCompanyBranding();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(null);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotSending, setForgotSending] = useState(false);
  const resetInFlight = useRef(false);

  React.useEffect(() => {
    const authError = consumeAuthErrorMessage();
    if (authError) {
      toast.error("Sign-in failed", { description: authError, duration: 12000 });
    }
  }, []);

  React.useEffect(() => {
    if (isRecoveryCallbackUrl()) {
      const search = window.location.search || "";
      const hash = window.location.hash || "";
      navigate(`/auth/reset-password${search}${hash}`, { replace: true });
    }
  }, [navigate]);

  React.useEffect(() => {
    if (!isAuthenticated || isPendingAuthCallbackUrl()) return;
    if (isRecoveryCallbackUrl()) {
      const search = window.location.search || "";
      const hash = window.location.hash || "";
      navigate(`/auth/reset-password${search}${hash}`, { replace: true });
      return;
    }
    navigate("/", { replace: true });
  }, [isAuthenticated, navigate]);

  if (isPendingAuthCallbackUrl() || isLoadingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!password) {
      toast.error(`Enter your password, or use ${SOCIAL_LOGIN_NAMES}.`);
      return;
    }
    setLoading(true);
    try {
      await login(email, password);
      navigate("/", { replace: true });
    } catch (err) {
      toast.error(err.message || "Login failed. Please check your credentials.");
    } finally {
      setLoading(false);
    }
  };

  const openForgotPassword = () => {
    setForgotEmail(email.trim());
    setForgotOpen(true);
  };

  const sendPasswordReset = async (e) => {
    e.preventDefault();
    const em = forgotEmail.trim();
    if (!em) {
      toast.error("Enter your email address.");
      return;
    }
    if (resetInFlight.current) return;
    const waitMs = msUntilResetAllowed(em);
    if (waitMs > 0) {
      const secs = Math.ceil(waitMs / 1000);
      toast.error(`Please wait ${secs}s before requesting another reset link for this address.`);
      return;
    }
    resetInFlight.current = true;
    setForgotSending(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(em, {
        redirectTo: `${window.location.origin}/auth/reset-password`,
      });
      if (error) throw error;
      markResetEmailSent(em);
      toast.success("If an account exists for that email, you will receive a reset link shortly. Check your inbox and spam folder.");
      setForgotOpen(false);
    } catch (err) {
      const msg = err?.message || "Could not send reset email.";
      if (/rate limit|too many requests/i.test(msg)) {
        toast.error(
          "Your project temporarily limits how often password-reset emails can be sent (this is normal after several tries). Wait about 15–60 minutes, then try again, or use the most recent link from your inbox if it is still valid."
        );
      } else {
        toast.error(msg);
      }
    } finally {
      resetInFlight.current = false;
      setForgotSending(false);
    }
  };

  const oauth = async (provider, loadingKey) => {
    setOauthLoading(loadingKey || provider);
    try {
      const appOrigin =
        (import.meta.env.VITE_APP_URL || "").replace(/\/$/, "") || window.location.origin;
      rememberOAuthStartOrigin();
      const redirectTo = `${appOrigin}/auth/callback`;
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo, skipBrowserRedirect: false },
      });
      if (error) throw error;
    } catch (err) {
      const msg = err?.message || String(err);
      if (/not enabled|Unsupported provider|validation_failed/i.test(msg)) {
        toast.error(
          `Social sign-in is not configured. In Supabase: enable Google under Providers, add Yahoo as a custom OIDC provider (custom:yahoo), and add ${window.location.origin}/auth/callback under Redirect URLs.`
        );
      } else {
        const label =
          LOGIN_OAUTH_PROVIDERS.find((p) => p.provider === provider)?.label || "Social";
        toast.error(msg || `${label} sign-in failed`);
      }
      setOauthLoading(null);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm shadow-lg border-border">
        <CardHeader className="text-center pb-4">
          <div className="w-14 h-14 rounded-xl bg-primary flex items-center justify-center mx-auto mb-3 overflow-hidden ring-1 ring-primary/20">
            <CompanyLogoMark
              src={resolvedLogoSrc}
              companyName={companyName}
              imgClassName="w-full h-full object-contain bg-primary p-1"
              letterClassName="text-primary-foreground font-bold text-2xl"
            />
          </div>
          <CardTitle className="text-2xl font-bold">{companyName}</CardTitle>
          <p className="text-sm font-medium text-foreground">Sign in</p>
          <p className="text-sm text-muted-foreground leading-snug max-w-xs mx-auto">
            Sign in with Google or Yahoo, or use your email and password below.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {LOGIN_OAUTH_PROVIDERS.map(({ key, provider, label }) => {
              if (key === "google") {
                return (
                  <GoogleSignInButton
                    key={key}
                    loading={oauthLoading === "google"}
                    disabled={!!oauthLoading && oauthLoading !== "google"}
                    onLoadingChange={(busy) => setOauthLoading(busy ? "google" : null)}
                  />
                );
              }
              const oauthBtnClass =
                "bg-white hover:bg-[#6001D2]/[0.06] border-[#6001D2]/25 text-[#6001D2] shadow-sm dark:bg-card dark:hover:bg-[#6001D2]/10 dark:border-[#6001D2]/35";
              return (
                <Button
                  key={key}
                  type="button"
                  variant="outline"
                  className={`w-full h-11 gap-2.5 font-medium transition-colors ${oauthBtnClass}`}
                  title={`Sign in with ${label}`}
                  aria-label={`Sign in with ${label}`}
                  disabled={!!oauthLoading}
                  onClick={() => oauth(provider, key)}
                >
                  {oauthLoading === key ? (
                    <Loader2 className="w-5 h-5 shrink-0 animate-spin" />
                  ) : (
                    <>
                      <YahooIcon />
                      <span>{label}</span>
                    </>
                  )}
                </Button>
              );
            })}
          </div>
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground text-xs font-medium">Or email</span>
            </div>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoFocus
              />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                autoComplete="current-password"
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Sign In
            </Button>
            <div className="text-center pt-1">
              <button
                type="button"
                onClick={openForgotPassword}
                className="text-sm font-medium text-destructive hover:text-destructive/90 hover:underline underline-offset-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm"
              >
                Forgot password?
              </button>
            </div>
          </form>
          <p className="text-sm text-muted-foreground text-center leading-relaxed">
            Invited by email? Open the link from your invitation, then set a password here or use {SOCIAL_LOGIN_NAMES}.
          </p>
        </CardContent>
      </Card>

      <Dialog open={forgotOpen} onOpenChange={setForgotOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reset your password</DialogTitle>
            <DialogDescription>
              Enter the email you use to sign in. If an account exists, we will send a link to choose a new password. Check
              your spam folder if nothing arrives within a few minutes.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={sendPasswordReset} className="space-y-4">
            <div>
              <Label htmlFor="forgot-email">Email</Label>
              <Input
                id="forgot-email"
                type="email"
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoComplete="email"
              />
            </div>
            <p className="text-[11px] text-muted-foreground leading-snug">
              Site setup: allow{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-[10px] break-all">
                {window.location.origin}/auth/reset-password
              </code>{" "}
              under Supabase → Authentication → URL Configuration → Redirect URLs.
            </p>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={() => setForgotOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={forgotSending}>
                {forgotSending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Send reset link
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
