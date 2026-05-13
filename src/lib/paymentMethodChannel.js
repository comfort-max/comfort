import { isPaymentMethodRowActive } from "@/lib/paymentMethodUi";

/**
 * Classify stored payment `method` strings into Cash vs Bank tabs using
 * Company Settings `payment_methods` rows (active only, by `type`: cash | bank).
 * Legacy rows may store slugs like "cash" / "cheque" from older UIs — those map
 * to cash / bank when they match common English tokens.
 */

const normalizeMethodName = (m) =>
  String(m ?? "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");

/**
 * @param {Array<{ name?: string, type?: string, status?: string | null }>} paymentMethods
 */
export function buildPaymentMethodClassifier(paymentMethods = []) {
  const active = paymentMethods.filter(isPaymentMethodRowActive);
  /** @type {Map<string, 'cash' | 'bank'>} */
  const byNormName = new Map();
  for (const m of active) {
    const t = String(m.type || "").toLowerCase();
    if (t !== "cash" && t !== "bank") continue;
    const key = normalizeMethodName(m.name);
    if (key) byNormName.set(key, t);
  }

  function channelForStoredMethod(raw) {
    const k = normalizeMethodName(raw);
    if (!k) return null;
    if (byNormName.has(k)) return byNormName.get(k);

    /** Old hardcoded selects stored slug values instead of display labels */
    const slug = k.replace(/\s/g, "");
    const legacy = {
      cash: "cash",
      cod: "cash",
      bank: "bank",
      cheque: "bank",
      check: "bank",
      chq: "bank",
      upi: "bank",
      online: "bank",
      card: "bank",
      neft: "bank",
      rtgs: "bank",
      imps: "bank",
    };
    const mapped = legacy[slug];
    if (!mapped) return null;
    return mapped;
  }

  const bankLabelsPreview = active
    .filter((m) => String(m.type || "").toLowerCase() === "bank")
    .map((m) => m.name)
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));

  return {
    isCash: (raw) => channelForStoredMethod(raw) === "cash",
    isBank: (raw) => channelForStoredMethod(raw) === "bank",
    channelForStoredMethod,
    bankLabelsPreview,
  };
}
