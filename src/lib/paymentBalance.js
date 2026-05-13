/**
 * Customer bill balances: amount_due may be negative (customer credit / paid excess).
 * @param {number} totalAmount
 * @param {number} totalPaidCollected
 * @returns {{ amount_paid: number, amount_due: number, payment_status: string }}
 */
export function computeBillCustomerBalance(totalAmount, totalPaidCollected) {
  const T = Number(totalAmount) || 0;
  const P = Number(totalPaidCollected) || 0;
  const amount_due = T - P;
  let payment_status;
  if (P <= 0) payment_status = "pending";
  else if (amount_due > 0) payment_status = "partial";
  else if (amount_due === 0) payment_status = "paid";
  else payment_status = "paid_excess";
  return { amount_paid: P, amount_due, payment_status };
}

/**
 * Signed balance remaining on a vendor billing row (positive = we still owe vendor).
 * @param {{ amount?: number, amount_paid?: number }} row
 */
export function vendorBillingSignedDue(row) {
  const a = Number(row?.amount) || 0;
  const p = Number(row?.amount_paid) || 0;
  return a - p;
}

/**
 * Vendor billing payment status after a given total paid (may exceed invoice amount).
 */
export function computeVendorBillingPaymentState(totalAmount, totalPaid) {
  const T = Number(totalAmount) || 0;
  const P = Number(totalPaid) || 0;
  const balanceDue = T - P;
  let payment_status;
  if (P <= 0) payment_status = "pending";
  else if (balanceDue > 0) payment_status = "partial";
  else if (balanceDue === 0) payment_status = "paid";
  else payment_status = "overpaid";
  return { amount_paid: P, payment_status, balanceDue };
}
