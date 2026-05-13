const EPS = 0.005;

/**
 * Whether cumulative customer payment on this line covers the line amount.
 * @param {{ amount?: number }} item
 * @param {number} cumulativePaidOnLine
 */
export function isLineItemFullyPaid(item, cumulativePaidOnLine) {
  const lineAmt = Number(item?.amount) || 0;
  if (lineAmt <= 0) return cumulativePaidOnLine > 0;
  return cumulativePaidOnLine + EPS >= lineAmt;
}

/**
 * After recording a payment against a delivered-unpaid line: cumulative total on the line,
 * delivery_status stays delivered_unpaid until the line is fully paid.
 * @param {Record<string, unknown>} item — bill_item row before update
 * @param {number} paymentAmount — amount from this payment row
 * @param {string} date
 * @param {string} method
 * @param {string} collected_by_name
 */
export function buildDeliveredLineItemPaymentPatch(item, paymentAmount, date, method, collected_by_name) {
  const prev = Number(item?.payment_amount) || 0;
  const cumulative = prev + (Number(paymentAmount) || 0);
  const fully = isLineItemFullyPaid(item, cumulative);
  return {
    delivery_status: fully ? "delivered_paid" : "delivered_unpaid",
    payment_amount: cumulative,
    payment_method: String(method || "").trim(),
    payment_collected_by_name: String(collected_by_name || "").trim(),
    payment_date: date,
  };
}

/**
 * For Payment Collection table: same delivery states as Delivery → Item by Status (vendor-assigned lines only).
 * @param {string|null|undefined} billId
 * @param {Array<Record<string, unknown>>} billItems
 * @returns {string|null} delivery_status key for StatusBadge, or null for em dash
 */
export function aggregateBillDeliveryStatusForPaymentRow(billId, billItems) {
  if (!billId) return null;
  const byBill = (billItems || []).filter((i) => i.bill_id === billId);
  const vendorDelivered = byBill.filter(
    (i) => i.vendor_id && ["delivered_unpaid", "delivered_paid"].includes(i.delivery_status)
  );
  const delivered =
    vendorDelivered.length > 0
      ? vendorDelivered
      : byBill.filter((i) => ["delivered_unpaid", "delivered_paid"].includes(i.delivery_status));
  if (!delivered.length) return null;
  if (delivered.every((i) => i.delivery_status === "delivered_paid")) return "delivered_paid";
  return "delivered_unpaid";
}
