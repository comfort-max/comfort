import React, { useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "./Sidebar";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/hooks/usePermissions";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";

export default function AppLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const { allowedForCurrentRoute, isLoading } = usePermissions();
  const location = useLocation();
  const { logout } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground text-sm">
        Loading…
      </div>
    );
  }

  if (!allowedForCurrentRoute) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6">
        <p className="text-muted-foreground text-center max-w-md">
          You do not have access to <span className="font-medium text-foreground">{location.pathname}</span>. Ask an
          administrator to update your role permissions.
        </p>
        <div className="flex flex-col sm:flex-row gap-2">
          <Button asChild>
            <Link to="/">Go to dashboard</Link>
          </Button>
          <Button type="button" variant="outline" onClick={() => void logout()}>
            Log out
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Sidebar collapsed={collapsed} setCollapsed={setCollapsed} />
      <main
        className={cn(
          "transition-all duration-300 min-h-screen",
          collapsed ? "lg:ml-16" : "lg:ml-64"
        )}
      >
        <div className="p-4 lg:p-6 pt-16 lg:pt-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}