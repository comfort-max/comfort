import { PERMISSION_RESOURCES } from "./permissionResources";
import { capabilitiesForResource } from "./resourceCapabilities";

export function isAdminRoleName(role) {
  if (!role) return false;
  return String(role).toLowerCase() === "admin";
}

/**
 * Resolve a single capability value using optional inherit chain (view/edit/delete only for inherit field).
 * @param {Record<string, boolean|undefined>} rawP
 * @param {{ key: string, inherit?: string }} capDef
 */
function resolveCapability(rawP, capDef) {
  if (rawP[capDef.key] !== undefined) return !!rawP[capDef.key];
  if (capDef.inherit && ["view", "edit", "delete"].includes(capDef.inherit)) {
    return !!rawP[capDef.inherit];
  }
  return false;
}

/**
 * Apply rules: no view => all false; edit/delete imply view for booleans we control.
 * @param {Record<string, boolean>} flat
 * @param {import("./resourceCapabilities").ResourceCapability[]} defs
 */
export function applyImpliedRules(flat, defs) {
  const keys = defs.map((d) => d.key);
  const out = { ...flat };
  if (!out.view) {
    for (const k of keys) out[k] = false;
    return out;
  }
  if (out.edit || out.delete) out.view = true;
  return out;
}

/**
 * @param {Record<string, Record<string, boolean>>|null|undefined} raw
 */
export function normalizePermissions(raw) {
  const out = {};
  for (const r of PERMISSION_RESOURCES) {
    const defs = capabilitiesForResource(r.key);
    const rawP = raw?.[r.key] || {};
    const flat = {};
    for (const capDef of defs) {
      flat[capDef.key] = resolveCapability(rawP, capDef);
    }
    out[r.key] = applyImpliedRules(flat, defs);
  }
  return out;
}

/**
 * @param {Record<string, Record<string, boolean>>|null|undefined} permissions
 * @param {string|null|undefined} resourceKey
 * @param {string} action capability key (view, edit, delete, export, …)
 */
export function canAction(permissions, resourceKey, action) {
  if (!resourceKey) return true;
  const p = permissions?.[resourceKey];
  if (!p) return false;
  if (!p.view) return false;
  if (action === "view") return true;
  return !!p[action];
}

export function defaultPermissionsObject() {
  return normalizePermissions({});
}

export function defaultNewRolePermissions() {
  return normalizePermissions({ dashboard: { view: true } });
}

export function fullAccessPermissionsObject() {
  const raw = {};
  for (const r of PERMISSION_RESOURCES) {
    raw[r.key] = {};
    for (const c of capabilitiesForResource(r.key)) {
      raw[r.key][c.key] = true;
    }
  }
  return normalizePermissions(raw);
}
