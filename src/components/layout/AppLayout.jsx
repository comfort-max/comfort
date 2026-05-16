import React, { useState } from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuth } from "@/lib/AuthContext";
import AccessDeniedScreen from "@/components/shared/AccessDeniedScreen";

export default function AppLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const { allowedForCurrentRoute, isLoading } = usePermissions();
  const { logout } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground text-sm">
        Loading…
      </div>
    );
  }

  if (!allowedForCurrentRoute) {
    return <AccessDeniedScreen onLogout={logout} />;
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
