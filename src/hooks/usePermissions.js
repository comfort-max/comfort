import { useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";
import { db } from "@/services/SupabaseService";
import { useAuth } from "@/lib/AuthContext";
import { pathToResourceKey } from "@/lib/permissionResources";
import { isAdminRoleName, normalizePermissions, canAction } from "@/lib/permissions";
import { roleNameFromAppRoleRow } from "@/lib/appRoles";

export function usePermissions() {
  const { user } = useAuth();
  const location = useLocation();
  const roleName = user?.role;

  const { data: roles = [], isLoading } = useQuery({
    queryKey: ["app-roles"],
    queryFn: () => db.AppRole.list("name"),
    staleTime: 5 * 60 * 1000,
  });

  const isAdmin = isAdminRoleName(roleName);

  const permissions = useMemo(() => {
    if (isAdmin) {
      return null;
    }
    if (isLoading) {
      return undefined;
    }
    const match = roles.find(
      (r) =>
        String(roleNameFromAppRoleRow(r)).toLowerCase() === String(roleName || "").toLowerCase()
    );
    if (!match) {
      return normalizePermissions({});
    }
    const raw = match.permissions;
    if (!raw || typeof raw !== "object" || Object.keys(raw).length === 0) {
      return null;
    }
    return normalizePermissions(raw);
  }, [roles, roleName, isAdmin, isLoading]);

  const currentResourceKey = pathToResourceKey(location.pathname);

  const can = useCallback(
    (resourceKey, action = "view") => {
      if (isAdmin) return true;
      if (permissions === undefined) return false;
      if (permissions === null) return true;
      return canAction(permissions, resourceKey, action);
    },
    [isAdmin, permissions]
  );

  const canAccessPath = useCallback(
    (pathname) => {
      if (isAdmin) return true;
      if (permissions === undefined) return false;
      if (permissions === null) return true;
      const key = pathToResourceKey(pathname);
      if (!key) return true;
      return canAction(permissions, key, "view");
    },
    [isAdmin, permissions]
  );

  const allowedForCurrentRoute =
    isAdmin ||
    !currentResourceKey ||
    permissions === null ||
    (permissions !== undefined && canAction(permissions, currentResourceKey, "view"));

  return {
    isLoading: (isLoading && !isAdmin) || permissions === undefined,
    isAdmin,
    permissions,
    currentResourceKey,
    can,
    canAccessPath,
    allowedForCurrentRoute,
  };
}
