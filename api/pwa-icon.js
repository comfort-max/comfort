import { fetchLogoImageBytes } from "./_lib/companyLogo.js";

let sharpModule;

async function getSharp() {
  if (sharpModule !== undefined) return sharpModule;
  try {
    sharpModule = (await import("sharp")).default;
  } catch {
    sharpModule = null;
  }
  return sharpModule;
}

export default async function handler(req, res) {
  const size = Math.min(512, Math.max(48, parseInt(String(req.query?.size || "192"), 10) || 192));
  const maskable = String(req.query?.maskable || "") === "1";

  try {
    const image = await fetchLogoImageBytes();
    if (!image?.buffer?.length) {
      return res.redirect(307, `/icons/icon.svg`);
    }

    const sharp = await getSharp();
    if (sharp) {
      let pipeline = sharp(image.buffer);
      if (maskable) {
        const inner = Math.round(size * 0.8);
        pipeline = sharp(image.buffer)
          .resize(inner, inner, { fit: "contain", background: { r: 42, g: 122, b: 140, alpha: 1 } })
          .extend({
            top: Math.floor((size - inner) / 2),
            bottom: Math.ceil((size - inner) / 2),
            left: Math.floor((size - inner) / 2),
            right: Math.ceil((size - inner) / 2),
            background: { r: 42, g: 122, b: 140, alpha: 1 },
          });
      } else {
        pipeline = sharp(image.buffer).resize(size, size, {
          fit: "contain",
          background: { r: 248, g: 250, b: 252, alpha: 1 },
        });
      }
      const png = await pipeline.png().toBuffer();
      res.setHeader("Content-Type", "image/png");
      res.setHeader("Cache-Control", "public, max-age=86400, s-maxage=86400");
      return res.status(200).send(png);
    }

    res.setHeader("Content-Type", image.mime || "image/png");
    res.setHeader("Cache-Control", "public, max-age=86400, s-maxage=86400");
    return res.status(200).send(image.buffer);
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Icon failed" });
  }
}
