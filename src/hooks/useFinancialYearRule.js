import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { db } from "@/services/SupabaseService";
import { normalizeFinancialYearRule } from "@/lib/financialYear";

/**
 * Loads company settings and returns the normalized financial-year rule.
 * React Query dedupes with other `company-settings` fetches.
 */
export function useFinancialYearRule() {
  const { data: settings = [], isLoading } = useQuery({
    queryKey: ["company-settings"],
    queryFn: () => db.CompanySettings.list(),
    staleTime: 30 * 60 * 1000,
  });
  const rule = useMemo(() => normalizeFinancialYearRule(settings[0]), [settings]);
  return { rule, settings: settings[0], isLoading };
}
