import React, { useState } from "react";
import { useLocation } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/AuthContext";
import { sendAccessRequestToAdmins } from "@/services/SupabaseService";
import { Loader2, Mail } from "lucide-react";
import { toast } from "sonner";

export default function AccessDeniedScreen({ onLogout }) {
  const location = useLocation();
  const { user } = useAuth();
  const [lastMessage, setLastMessage] = useState("");

  const requestMutation = useMutation({
    mutationFn: () => sendAccessRequestToAdmins(),
    onSuccess: (data) => {
      const msg =
        data?.message ||
        (data?.alreadyNotified
          ? "A request was already sent recently. Please wait before sending again."
          : "Request sent to administrators.");
      setLastMessage(msg);
      toast.success(msg);
    },
    onError: (err) => {
      toast.error(err?.message || "Could not send request");
    },
  });

  const displayName = user?.full_name || user?.email || "Your account";
  const roleLabel = user?.role ? String(user.role) : "user";

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 max-w-lg mx-auto">
      <p className="text-muted-foreground text-center">
        <span className="font-medium text-foreground">{displayName}</span> is signed in with role{" "}
        <span className="font-medium text-foreground capitalize">{roleLabel}</span>, which does not include access to{" "}
        <span className="font-medium text-foreground">{location.pathname}</span>.
      </p>
      <p className="text-sm text-muted-foreground text-center">
        Ask an administrator to assign you a role with the right permissions, or send a request below.
      </p>

      <Button
        type="button"
        className="gap-2"
        disabled={requestMutation.isPending}
        onClick={() => requestMutation.mutate()}
      >
        {requestMutation.isPending ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Mail className="w-4 h-4" />
        )}
        Send request to admin
      </Button>

      {lastMessage && (
        <p className="text-sm text-center text-emerald-700 dark:text-emerald-400">{lastMessage}</p>
      )}

      <div className="flex flex-col sm:flex-row gap-2 pt-2">
        <Button type="button" variant="outline" onClick={() => void onLogout?.()}>
          Log out
        </Button>
      </div>
    </div>
  );
}
