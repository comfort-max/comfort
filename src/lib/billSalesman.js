/**
 * Pickup employee is the salesman for customer-facing reporting.
 * Falls back to salesman_name when pickup is unset.
 * When names are blank but `pickup_employee_id` / `salesman_id` exist, resolves from `employeeById` (id → `{ name }`).
 * @param {Record<string, unknown> | null | undefined} bill
 * @param {Record<string, { name?: string }> | null | undefined} [employeeById]
 * @returns {string}
 */
export function getBillSalesmanDisplayName(bill, employeeById) {
  if (!bill) return "";
  let pickup = String(bill.pickup_employee_name ?? "").trim();
  if (!pickup && bill.pickup_employee_id && employeeById) {
    const e =
      employeeById[String(bill.pickup_employee_id)] ?? employeeById[bill.pickup_employee_id];
    pickup = String(e?.name ?? "").trim();
  }
  let salesman = String(bill.salesman_name ?? "").trim();
  if (!salesman && bill.salesman_id && employeeById) {
    const e = employeeById[String(bill.salesman_id)] ?? employeeById[bill.salesman_id];
    salesman = String(e?.name ?? "").trim();
  }
  return pickup || salesman;
}

/**
 * @param {Record<string, unknown>} payment payment_collections row (may include joined `bills`)
 */
export function embeddedBillFromPaymentJoin(payment) {
  const b = payment?.bills ?? payment?.bill;
  if (b == null) return undefined;
  const row = Array.isArray(b) ? b[0] : b;
  return row && typeof row === "object" ? row : undefined;
}

/** Trimmed bill # for matching `bills.bill_number` to `payment_collections.bill_number`. */
export function normalizePaymentBillNumber(billNumber) {
  return String(billNumber ?? "").trim();
}

/**
 * When several bills share a number, keep the row with the latest `bill_date` (best match for reporting).
 * @param {Record<string, unknown>[]} rows
 * @returns {Record<string, Record<string, unknown>>}
 */
export function foldBillsByBillNumber(rows) {
  /** @type {Record<string, Record<string, unknown>>} */
  const out = {};
  for (const b of rows || []) {
    const k = normalizePaymentBillNumber(b?.bill_number);
    if (!k) continue;
    const cur = out[k];
    if (!cur || String(b?.bill_date ?? "") > String(cur?.bill_date ?? "")) out[k] = b;
  }
  return out;
}

/**
 * Bill row for reporting: prefer `billMap` by id, then `billByNumberMap` by `bill_number`, then PostgREST embed.
 * Many payment rows store a reliable `bill_number` while `bill_id` is missing or points at a stale row.
 * @param {Record<string, unknown>} payment
 * @param {Record<string, Record<string, unknown>>} billMap keyed by bill id (string or number)
 * @param {Record<string, Record<string, unknown>> | null | undefined} [billByNumberMap] keyed by `normalizePaymentBillNumber`
 */
export function resolvePaymentBill(payment, billMap, billByNumberMap) {
  const id = payment?.bill_id;
  const byId = id != null && id !== "" ? billMap[String(id)] ?? billMap[id] : undefined;
  if (byId) return byId;
  const num = normalizePaymentBillNumber(payment?.bill_number);
  const byNum = num && billByNumberMap ? billByNumberMap[num] : undefined;
  if (byNum) return byNum;
  return embeddedBillFromPaymentJoin(payment);
}

/**
 * @param {Record<string, unknown>} payment payment_collections row
 * @param {Record<string, unknown> | undefined} bill
 * @param {Record<string, { name?: string }> | null | undefined} [employeeById]
 */
export function resolvePaymentSalesmanName(payment, bill, employeeById) {
  const stored = String(payment?.salesman_name ?? "").trim();
  if (stored) return stored;
  return getBillSalesmanDisplayName(bill, employeeById);
}
