import { format } from "date-fns";
import { supabase } from "@/lib/supabaseClient";
import { db } from "@/services/SupabaseService";
import { insertTrashItemRow } from "@/lib/trashItemsTable";
import { deleteBillRelatedExpenses } from "@/hooks/useCascadeDelete";

/**
 * Snapshot bill + children to `trash_items`, then remove live rows (same order as manual delete).
 * @param {string[]} billIds
 * @param {Record<string, unknown>[]} bills
 * @param {Record<string, unknown>[]} billItems
 */
export async function archiveBillsToTrash(billIds, bills, billItems) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const deletedBy = user?.email || "Unknown";
  const deletedDate = format(new Date(), "yyyy-MM-dd HH:mm");

  for (const billId of billIds) {
    const bill = bills.find((b) => b.id === billId);
    if (!bill) continue;
    const items = billItems.filter((i) => i.bill_id === billId);
    const vendorBillings = [];
    for (const item of items) {
      const vbRes = await db.VendorBilling.filter({ bill_item_id: item.id });
      vendorBillings.push(...vbRes);
    }
    const payments = await db.PaymentCollection.filter({ bill_id: billId });

    await insertTrashItemRow({
      original_entity: "Bill",
      original_id: billId,
      data: {
        version: 1,
        bill,
        billItems: items,
        vendorBillings,
        paymentCollections: payments,
      },
      deleted_by: deletedBy,
      deleted_date: deletedDate,
      display_name: `Bill #${bill.bill_number || billId}`,
    });

    await Promise.all(vendorBillings.map((vb) => db.VendorBilling.delete(vb.id)));
    await Promise.all(items.map((item) => db.BillItem.delete(item.id)));
    await Promise.all(payments.map((p) => db.PaymentCollection.delete(p.id)));
    await deleteBillRelatedExpenses(bill.bill_number);
    await db.Bill.delete(billId);
  }
}

function stripRowForInsert(row) {
  if (!row || typeof row !== "object") return row;
  const { created_date, updated_date, updated_at, ...rest } = row;
  return rest;
}

async function insertIntoFirstWorkingTable(tables, row) {
  const payload = stripRowForInsert(row);
  let lastErr = null;
  for (const t of tables) {
    const { error } = await supabase.from(t).insert(payload);
    if (!error) return;
    lastErr = error;
    const msg = String(error.message || "");
    if (!/schema cache|does not exist|relation|42P01/i.test(msg)) {
      throw error;
    }
  }
  if (lastErr) throw lastErr;
}

/**
 * Recreate bill graph from a trash snapshot (preserves primary keys).
 * @param {{ version?: number; bill: Record<string, unknown>; billItems?: Record<string, unknown>[]; vendorBillings?: Record<string, unknown>[]; paymentCollections?: Record<string, unknown>[] }} data
 */
export async function restoreBillFromTrashPayload(data) {
  const bill = data?.bill;
  if (!bill) throw new Error("Invalid bill snapshot");

  await insertIntoFirstWorkingTable(["bills", "bill"], bill);

  for (const bi of data.billItems || []) {
    await insertIntoFirstWorkingTable(["bill_items", "bill_item"], bi);
  }
  for (const vb of data.vendorBillings || []) {
    await insertIntoFirstWorkingTable(["vendor_billings", "vendor_billing"], vb);
  }
  for (const p of data.paymentCollections || []) {
    await insertIntoFirstWorkingTable(["payment_collections", "payment_collection"], p);
  }
}
