import pwaIconHandler from "./pwa-icon.js";

/** Browser tab favicon — same company logo as PWA icons, default 32×32. */
export default async function handler(req, res) {
  const size = Math.min(64, Math.max(16, parseInt(String(req.query?.size || "32"), 10) || 32));
  req.query = { ...req.query, size: String(size) };
  return pwaIconHandler(req, res);
}
