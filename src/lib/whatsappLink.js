/**
 * Strip to digits for https://wa.me/{digits} (no + prefix in URL).
 * @param {unknown} raw
 * @returns {string}
 */
export function normalizeWhatsappDigits(raw) {
  if (raw == null) return "";
  const s = String(raw).trim();
  if (!s) return "";
  return s.replace(/\D/g, "");
}

/**
 * @param {string} phoneDigits digits only, include country code (e.g. 919876543210)
 * @param {string} [message]
 * @returns {string|null}
 */
export function buildWhatsappMeUrl(phoneDigits, message) {
  const d = normalizeWhatsappDigits(phoneDigits);
  if (!d || d.length < 8) return null;
  const base = `https://wa.me/${d}`;
  if (message == null || message === "") return base;
  return `${base}?text=${encodeURIComponent(message)}`;
}
