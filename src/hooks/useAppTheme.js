import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { db } from "@/services/SupabaseService";
import { normalizeUiThemePreset } from "@/lib/uiThemePresets";

/**
 * Applies `company_settings.ui_theme_preset` to the document root via `data-ui-theme`
 * so `index.css` can swap CSS variables (sidebar, primary, surfaces).
 */
export function useAppTheme() {
  const { data: companySettings = [] } = useQuery({
    queryKey: ["company-settings"],
    queryFn: () => db.CompanySettings.list(),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const preset = normalizeUiThemePreset(companySettings[0]?.ui_theme_preset);

  useEffect(() => {
    const root = document.documentElement;
    if (preset === "default") {
      root.removeAttribute("data-ui-theme");
    } else {
      root.setAttribute("data-ui-theme", preset);
    }
  }, [preset]);
}
