const MANIFEST_BASE = {
  name: "COMFORT Laundry",
  short_name: "COMFORT",
  description: "COMFORT Laundry Management System",
  start_url: "/",
  scope: "/",
  display: "standalone",
  orientation: "any",
  background_color: "#f8fafc",
  theme_color: "#2a7a8c",
  categories: ["business", "productivity"],
};

export default async function handler(req, res) {
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host || "comfort-weld.vercel.app";
  const origin = `${proto}://${host}`.replace(/\/$/, "");

  const icons = [
    {
      src: `${origin}/api/pwa-icon?size=192`,
      sizes: "192x192",
      type: "image/png",
      purpose: "any",
    },
    {
      src: `${origin}/api/pwa-icon?size=512`,
      sizes: "512x512",
      type: "image/png",
      purpose: "any",
    },
    {
      src: `${origin}/api/pwa-icon?size=512&maskable=1`,
      sizes: "512x512",
      type: "image/png",
      purpose: "maskable",
    },
  ];

  res.setHeader("Content-Type", "application/manifest+json");
  res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=3600");
  return res.status(200).json({ ...MANIFEST_BASE, icons });
}
