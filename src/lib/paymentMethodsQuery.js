import { db } from "@/services/SupabaseService";

/** Single source of truth for React Query — every screen must use the same key + fetcher. */
export const PAYMENT_METHODS_QUERY_KEY = ["payment-methods"];

export function fetchPaymentMethods() {
  return db.PaymentMethod.list();
}
