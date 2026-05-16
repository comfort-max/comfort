/** @typedef {{ id: string; label: string; description: string }} UiThemePresetMeta */

/** @type {UiThemePresetMeta[]} */
export const UI_THEME_PRESETS = [
  {
    id: "default",
    label: "Default (balanced)",
    description: "Teal primary with the standard dark sidebar and matching page accents.",
  },
  {
    id: "slate_soft",
    label: "Slate — softer sidebar",
    description: "Charcoal sidebar with lighter tabs, headers, and accents across the app.",
  },
  {
    id: "light_sidebar",
    label: "Light sidebar",
    description: "Pale sidebar with dark text; main app stays light — less “heavy” on the left.",
  },
  {
    id: "ocean",
    label: "Ocean (cool & vivid)",
    description: "Deep blue sidebar and brighter cyan accents across the app.",
  },
  {
    id: "violet",
    label: "Violet (bold)",
    description: "Indigo sidebar and vibrant purple primary buttons and highlights.",
  },
  {
    id: "sunset",
    label: "Sunset (warm)",
    description: "Warm rust sidebar, coral primary, and a soft cream-tinted background.",
  },
  {
    id: "brand_navy",
    label: "Brand — Navy (#153D64)",
    description: "Deep navy sidebar and accents around #153D64.",
  },
  {
    id: "brand_sky",
    label: "Brand — Sky (#00B0F0)",
    description: "Bright sky-blue primary (#00B0F0) with a deep cool sidebar.",
  },
  {
    id: "brand_teal",
    label: "Brand — Teal (#009999)",
    description: "Rich teal primary and matching deep sidebar.",
  },
  {
    id: "brand_moss",
    label: "Brand — Moss (#2F5B4C)",
    description: "Muted forest green (#2F5B4C) for sidebar and accents.",
  },
  {
    id: "brand_emerald",
    label: "Brand — Emerald (#006A4E)",
    description: "Deep emerald green (#006A4E) across sidebar and primary actions.",
  },
  {
    id: "brand_sea",
    label: "Brand — Sea (#007370)",
    description: "Cool sea-green (#007370) sidebar and highlights.",
  },
];

export const UI_THEME_PRESET_IDS = UI_THEME_PRESETS.map((p) => p.id);

/**
 * @param {string | null | undefined} raw
 * @returns {string}
 */
export function normalizeUiThemePreset(raw) {
  const id = String(raw || "default")
    .trim()
    .toLowerCase();
  return UI_THEME_PRESET_IDS.includes(id) ? id : "default";
}
