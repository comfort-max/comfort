/**
 * Built-in Supabase provider: google.
 * Yahoo uses a custom OIDC provider — configure in Supabase Dashboard with identifier `custom:yahoo`
 * (or override via VITE_YAHOO_OAUTH_PROVIDER).
 */
export const YAHOO_OAUTH_PROVIDER =
  (import.meta.env.VITE_YAHOO_OAUTH_PROVIDER || "custom:yahoo").trim();

/** @type {{ key: string, provider: string, label: string }[]} */
export const LOGIN_OAUTH_PROVIDERS = [
  { key: "google", provider: "google", label: "Google" },
  { key: "yahoo", provider: YAHOO_OAUTH_PROVIDER, label: "Yahoo" },
];

export const SOCIAL_LOGIN_NAMES = LOGIN_OAUTH_PROVIDERS.map((p) => p.label).join(", ");
