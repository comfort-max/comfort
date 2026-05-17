const DEFAULT_APP_ORIGIN = "https://comfort-weld.vercel.app";

/** Canonical app origin for install links and Open Graph. */
export function getAppOrigin() {
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin.replace(/\/$/, "");
  }
  const fromEnv = import.meta.env.VITE_APP_URL;
  return String(fromEnv || DEFAULT_APP_ORIGIN).replace(/\/$/, "");
}

export function getAppInstallUrl() {
  return `${getAppOrigin()}/install`;
}
