import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { db } from "@/services/SupabaseService";
import { getCurrencyConfig, formatCurrencyAmount } from "@/lib/currency";

/**
 * Reads `company_settings` and exposes the selected display currency.
 */
export function useAppCurrency() {
  const { data: settings = [], isLoading } = useQuery({
    queryKey: ["company-settings"],
    queryFn: () => db.CompanySettings.list(),
    staleTime: 30 * 60 * 1000,
  });
  const row = settings[0];
  const config = useMemo(() => getCurrencyConfig(row), [row]);
  const format = useCallback((amount) => formatCurrencyAmount(amount, row), [row]);

  return {
    ...config,
    format,
    settings: row,
    isLoading,
  };
}
