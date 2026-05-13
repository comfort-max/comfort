/**
 * Display name for an `app_roles` row (handles minor schema / naming differences).
 * @param {Record<string, unknown> | null | undefined} row
 * @returns {string}
 */
export function roleNameFromAppRoleRow(row) {
  if (!row || typeof row !== "object") return "";
  const n = row.name ?? row.role_name ?? row.title ?? row.role;
  return String(n ?? "").trim();
}
