import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { PAYMENT_METHODS_QUERY_KEY, fetchPaymentMethods } from "@/lib/paymentMethodsQuery";

/**
 * Company Settings payment methods — shared cache across the app.
 * `keepPreviousData` avoids flashing empty lists while refetching after Save Settings / invalidation.
 */
export function usePaymentMethodsQuery() {
  return useQuery({
    queryKey: PAYMENT_METHODS_QUERY_KEY,
    queryFn: fetchPaymentMethods,
    staleTime: 2 * 60 * 1000,
    placeholderData: keepPreviousData,
  });
}
