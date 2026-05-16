import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/api/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function AcceptInvitePage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const hash = window.location.hash?.replace(/^#/, "") || "";
      const params = new URLSearchParams(hash);
      const access_token = params.get("access_token");
      const refresh_token = params.get("refresh_token");
      if (!access_token || !refresh_token) {
        toast.error("Invalid or expired invite link. Ask your admin to resend the invitation.");
        navigate("/login", { replace: true });
        return;
      }
      const { error } = await supabase.auth.setSession({ access_token, refresh_token });
      if (cancelled) return;
      if (error) {
        toast.error(error.message || "Could not open invite session");
        navigate("/login", { replace: true });
        return;
      }
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
      setReady(true);
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
      const { data: u } = await supabase.auth.getUser();
      const authUser = u?.user;
      const em = authUser?.email;
      const invitedRole = String(authUser?.user_metadata?.role || "").trim();
      const invitedName = String(authUser?.user_metadata?.full_name || "").trim();
      if (authUser?.id) {
        const role = invitedRole || "user";
        const full_name = invitedName || (authUser.email ? authUser.email.split("@")[0] : "") || "";
        const { error: profErr } = await supabase.from("profiles").upsert(
          {
            id: authUser.id,
            email: authUser.email || em || "",
            full_name,
            role,
          },
          { onConflict: "id" }
        );
        if (profErr) console.warn("profiles upsert after invite:", profErr.message);
      }
      if (em) {
        await supabase.from("invitations").update({ status: "accepted" }).eq("email", em).eq("status", "pending");
      }
      toast.success("Password saved. You are signed in.");
      navigate("/", { replace: true });
    } catch (err) {
      toast.error(err.message || "Failed to set password");
    } finally {
      setBusy(false);
    }
  };

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm shadow-lg">
        <CardHeader>
          <CardTitle className="text-lg">Verify email &amp; set password</CardTitle>
          <p className="text-sm text-muted-foreground">
            Your email is verified from the invite link. Choose a password for this account, or go back to login and
            use Google or Yahoo instead.
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div>
              <Label htmlFor="pw1">New password</Label>
              <Input
                id="pw1"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                required
                minLength={6}
              />
            </div>
            <div>
              <Label htmlFor="pw2">Confirm password</Label>
              <Input
                id="pw2"
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
