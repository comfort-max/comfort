import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/api/supabaseClient";
import {
  getAuthCallbackFromUrl,
  isRecoveryCallbackUrl,
  shouldPromptForPassword,
} from "@/lib/authCallback";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [phase, setPhase] = useState("checking");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const recoveryFromUrl = isRecoveryCallbackUrl();
      const callback = getAuthCallbackFromUrl();

      if (callback?.kind === "recovery" && callback.code) {
        const { data, error } = await supabase.auth.exchangeCodeForSession(callback.code);
        if (cancelled) return;
        if (error) {
          toast.error(error.message || "Invalid or expired reset link");
          setPhase("invalid");
          return;
        }
        window.history.replaceState(null, "", window.location.pathname);
        const user = data?.session?.user;
        if (user && !shouldPromptForPassword(user)) {
          navigate("/", { replace: true });
          return;
        }
        setPhase("ready");
        return;
      }

      const hash = window.location.hash?.replace(/^#/, "") || "";
      const params = new URLSearchParams(hash);
      const access_token = params.get("access_token");
      const refresh_token = params.get("refresh_token");

      if (access_token && refresh_token) {
        const type = params.get("type");
        if (type !== "recovery") {
          if (cancelled) return;
          navigate("/", { replace: true });
          return;
        }
        const { data, error } = await supabase.auth.setSession({ access_token, refresh_token });
        if (cancelled) return;
        if (error) {
          toast.error(error.message || "Could not open reset session");
          setPhase("invalid");
          return;
        }
        window.history.replaceState(null, "", window.location.pathname + window.location.search);
        const user = data?.session?.user;
        if (user && !shouldPromptForPassword(user)) {
          navigate("/", { replace: true });
          return;
        }
        setPhase("ready");
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled) return;

      if (session?.user && recoveryFromUrl && shouldPromptForPassword(session.user)) {
        setPhase("ready");
        return;
      }

      if (session?.user) {
        navigate("/", { replace: true });
        return;
      }

      setPhase("invalid");
    })();

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  const submit = async (e) => {
    e.preventDefault();
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    if (password !== password2) {
      toast.error("Passwords do not match");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success("Password updated. You are signed in.");
      navigate("/", { replace: true });
    } catch (err) {
      toast.error(err.message || "Failed to set password");
    } finally {
      setBusy(false);
    }
  };

  if (phase === "checking") {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (phase === "invalid") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-sm shadow-lg border-border">
          <CardHeader>
            <CardTitle className="text-lg">Reset link invalid or expired</CardTitle>
            <p className="text-sm text-muted-foreground">
              Open the link from your latest reset email, or request a new one from the login page.
            </p>
          </CardHeader>
          <CardContent>
            <Button className="w-full" onClick={() => navigate("/login", { replace: true })}>
              Back to login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm shadow-lg border-border">
        <CardHeader>
          <CardTitle className="text-lg">Choose a new password</CardTitle>
          <p className="text-sm text-muted-foreground">Enter and confirm your new password below.</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div>
              <Label htmlFor="rpw1">New password</Label>
              <Input
                id="rpw1"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                required
                minLength={6}
              />
            </div>
            <div>
              <Label htmlFor="rpw2">Confirm password</Label>
              <Input
                id="rpw2"
                type="password"
                value={password2}
                onChange={(e) => setPassword2(e.target.value)}
                autoComplete="new-password"
                required
                minLength={6}
              />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save password &amp; continue
            </Button>
            <Button type="button" variant="ghost" className="w-full" onClick={() => navigate("/login")}>
              Back to login
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
