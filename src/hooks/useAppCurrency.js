import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { db } from "@/services/SupabaseService";
import { getCurrencyConfig, formatCurrencyAmount } from "@/lib/currency";
import { normalizeCompanySettingsRow } from "@/lib/companySettingsPayload";

/**
 * Reads `company_settings` and exposes the selected display currency.
 */
export function useAppCurrency() {
  const { data: settings = [], isLoading } = useQuery({
    queryKey: ["company-settings"],
    queryFn: () => db.CompanySettings.list(),
    staleTime: 60 * 1000,
  });
  const row = useMemo(() => normalizeCompanySettingsRow(settings[0]), [settings[0]]);
  const config = useMemo(() => getCurrencyConfig(row), [row]);
  const format = useCallback((amount) => formatCurrencyAmount(amount, row), [row]);

  return {
    ...config,
    format,
    settings: row,
    isLoading,
  };
}
