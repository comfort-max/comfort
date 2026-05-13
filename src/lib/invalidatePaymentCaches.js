/**
 * Invalidate React Query caches after customer payments are recorded or changed.
 * Payment list UIs use keys prefixed with `['payments-all', …]`; reports used separate
 * keys before and were easy to miss on invalidate.
 */
export function invalidateAfterCustomerPaymentRecorded(queryClient) {
  queryClient.invalidateQueries({ queryKey: ["payments-all"] });
  queryClient.invalidateQueries({
    predicate: (q) => {
      const k0 = q.queryKey[0];
      if (typeof k0 !== "string") return false;
      if (k0.startsWith("bills-")) return true;
      if (k0.startsWith("bill-items")) return true;
      if (k0.startsWith("billItems")) return true;
      return false;
    },
  });
}
