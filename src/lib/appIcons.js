/**
 * Keep favicon / apple-touch-icon in sync with Company Settings logo.
 */

function upsertLink(rel, href, type) {
  if (!href) return;
  let el = document.querySelector(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement("link");
    el.rel = rel;
    document.head.appendChild(el);
  }
  if (type) el.type = type;
  if (el.getAttribute("href") !== href) el.setAttribute("href", href);
}

function guessIconType(href) {
  if (!href) return "image/png";
  const path = href.split("?")[0].toLowerCase();
  if (path.endsWith(".svg")) return "image/svg+xml";
  if (path.endsWith(".ico")) return "image/x-icon";
  return "image/png";
}

/**
 * @param {{ logoSrc?: string, companyName?: string, cacheBust?: boolean }} options
 */
export function applyDynamicAppIcons({ logoSrc, companyName, cacheBust = true } = {}) {
  const bust = cacheBust ? Date.now() : null;
  const withBust = (url) => {
    if (!bust) return url;
    const sep = url.includes("?") ? "&" : "?";
    return `${url}${sep}v=${bust}`;
  };

  let faviconHref;
  let appleHref;

  if (
    logoSrc &&
    (logoSrc.startsWith("blob:") ||
      logoSrc.startsWith("data:") ||
      logoSrc.startsWith("http"))
  ) {
    faviconHref = withBust(logoSrc);
    appleHref = withBust(logoSrc);
  } else {
    faviconHref = withBust("/api/favicon?size=32");
    appleHref = withBust("/api/pwa-icon?size=180");
  }

  const iconType = guessIconType(faviconHref);
  upsertLink("icon", faviconHref, iconType);
  upsertLink("apple-touch-icon", appleHref, iconType);

  if (companyName) {
    const base = String(companyName).trim() || "COMFORT";
    const nextTitle = `${base} Laundry`;
    if (document.title !== nextTitle) document.title = nextTitle;
  }
}
