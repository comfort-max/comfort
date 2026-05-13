import { supabase } from "@/lib/supabaseClient";
import { buildStaffWagesExpenseDescription } from "@/lib/salaryStaffWagesExpense";

async function selectFromEitherTable(tables, build) {
  for (const table of tables) {
    const qb = supabase.from(table);
    const q = build(qb);
    const { data, error } = await q;
    if (!error) return { table, rows: data || [] };
    const msg = String(error.message || "");
    if (!/schema cache|does not exist|relation|42P01/i.test(msg)) throw error;
  }
  return { table: tables[0], rows: [] };
}

async function deleteFromEitherTable(tables, build) {
  for (const table of tables) {
    const qb = supabase.from(table);
    const q = build(qb);
    const { error } = await q;
    if (!error) return;
    const msg = String(error.message || "");
    if (!/schema cache|does not exist|relation|42P01/i.test(msg)) throw error;
  }
}

/**
 * Vendor Billing → "Vendor Payments" expenses embed bill # in `description` / `vendor_bill_numbers`.
 * @param {string | number | null | undefined} billNumber
 */
export function expenseRowReferencesBillNumber(row, billNumber) {
  const bn = String(billNumber ?? "").trim();
  if (!bn) return false;
  const d = String(row?.description ?? "");
  const v = String(row?.vendor_bill_numbers ?? "");
  const escaped = bn.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`Bill #${escaped}(?!\\d)`);
  if (re.test(d)) return true;
  if (v === bn) return true;
  const parts = v.split(/[,\s;|]+/).map((s) => s.trim()).filter(Boolean);
  if (parts.includes(bn)) return true;
  return v.includes(bn);
}

export async function deleteBillRelatedExpenses(billNumber) {
  const bn = String(billNumber ?? "").trim();
  if (!bn) return;

  const { table, rows } = await selectFromEitherTable(["expenses", "expense"], (qb) =>
    qb.select("id,description,vendor_bill_numbers").eq("category", "Vendor Payments").limit(5000)
  );

  const ids = rows.filter((r) => expenseRowReferencesBillNumber(r, bn)).map((r) => r.id);
  if (!ids.length) return;

  const chunk = 80;
  for (let i = 0; i < ids.length; i += chunk) {
    const slice = ids.slice(i, i + chunk);
    await deleteFromEitherTable([table], (qb) => qb.delete().in("id", slice));
  }
}

export async function deleteStaffWagesExpenseForSalaryRecord(record) {
  if (!record || record.payment_status !== "paid") return;
  const desc = buildStaffWagesExpenseDescription(record);
  await deleteFromEitherTable(["expenses", "expense"], (qb) =>
    qb.delete().eq("category", "Staff Wages").eq("description", desc)
  );
}

export async function deleteEmployeeCascade(employeeId) {
  if (employeeId == null || employeeId === "") return;

  const { rows: salaryRows } = await selectFromEitherTable(["salary_records", "salary_record"], (qb) =>
    qb.select("id, month, year, employee_name, payment_status").eq("employee_id", employeeId)
  );

  for (const r of salaryRows) {
    if (r.payment_status === "paid") {
      const desc = buildStaffWagesExpenseDescription(r);
      await deleteFromEitherTable(["expenses", "expense"], (qb) =>
        qb.delete().eq("category", "Staff Wages").eq("description", desc)
      );
    }
  }

  await deleteFromEitherTable(["salary_records", "salary_record"], (qb) => qb.delete().eq("employee_id", employeeId));
}

export async function deleteCustomerCascade(customerId) {
  let bills = null;
  let err = null;
  ({ data: bills, error: err } = await supabase.from("bills").select("id, bill_number").eq("customer_id", customerId));
  if (err && /schema cache|does not exist|relation|42P01/i.test(String(err.message || ""))) {
    ({ data: bills, error: err } = await supabase.from("bill").select("id, bill_number").eq("customer_id", customerId));
  }
  if (err) throw err;

  for (const b of bills || []) {
    await deleteBillRelatedExpenses(b.bill_number);
  }

  const billIds = (bills || []).map((b) => b.id);
  if (billIds.length > 0) {
    await supabase.from("bill_items").delete().in("bill_id", billIds);
    await supabase.from("payment_collections").delete().in("bill_id", billIds);
    let derr = null;
    ({ error: derr } = await supabase.from("bills").delete().in("id", billIds));
    if (derr && /schema cache|does not exist|relation|42P01/i.test(String(derr.message || ""))) {
      ({ error: derr } = await supabase.from("bill").delete().in("id", billIds));
    }
    if (derr) throw derr;
  }
}

export async function deleteVendorCascade(vendorId) {
  await deleteFromEitherTable(["expenses", "expense"], (qb) => qb.delete().eq("vendor_id", vendorId));

  let err = null;
  ({ error: err } = await supabase.from("vendor_billings").delete().eq("vendor_id", vendorId));
  if (err && /schema cache|does not exist|relation|42P01/i.test(String(err.message || ""))) {
    ({ error: err } = await supabase.from("vendor_billing").delete().eq("vendor_id", vendorId));
  }
  if (err) throw err;

  ({ error: err } = await supabase.from("vendor_rates").delete().eq("vendor_id", vendorId));
  if (err && /schema cache|does not exist|relation|42P01/i.test(String(err.message || ""))) {
    ({ error: err } = await supabase.from("vendor_rate").delete().eq("vendor_id", vendorId));
  }
  if (err) throw err;
}
