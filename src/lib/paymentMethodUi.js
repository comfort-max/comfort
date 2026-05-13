import { localeDisplayCompare } from "@/lib/utils";

/** Same rule as dropdowns: active unless explicitly inactive/disabled. */
export function isPaymentMethodRowActive(m) {
  if (!m || typeof m !== "object") return false;
  const s = m.status;
  if (s === "inactive" || s === "disabled") return false;
  return true;
}

/**
 * Active payment methods for dropdowns — only rows from Company Settings (by `name`).
 * No synthetic "Cash / Bank Transfer" fallbacks (those looked like category options).
 */
export function activePaymentMethodsSorted(methods) {
  const raw = [...(methods || [])].filter((m) => m && String(m.name || "").trim());
  const active = raw.filter(isPaymentMethodRowActive);
  active.sort((a, b) => localeDisplayCompare(a.name, b.name));
  return active;
}

export function defaultPaymentMethodName(methods) {
  const list = activePaymentMethodsSorted(methods);
  const n = list[0]?.name;
  return n != null && String(n).trim() ? String(n).trim() : "";
}

/**
 * Radix Select requires `value` to match a SelectItem. Use when stored method name
 * may not match the current active list (e.g. renamed methods).
 */
export function paymentMethodSelectValue(methodName, sortedMethods, defaultName) {
  const list = sortedMethods || [];
  const m = String(methodName || "").trim();
  if (m && list.some((x) => String(x.name || "").trim() === m)) return m;
  const d = String(defaultName || list[0]?.name || "").trim();
  if (d && list.some((x) => String(x.name || "").trim() === d)) return d;
  return String(list[0]?.name || "").trim();
}
