import React, { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { usePaymentMethodsQuery } from "@/hooks/usePaymentMethodsQuery";
import { supabase } from "@/lib/supabaseClient";
import { db } from "@/services/SupabaseService";
import PageHeader from "@/components/shared/PageHeader";
import DataTable from "@/components/shared/DataTable";
import ConfirmModal from "@/components/shared/ConfirmModal";
import ProgressModal from "@/components/shared/ProgressModal";
import { useSoftDelete } from "@/hooks/useSoftDelete";
import StatusBadge from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { formatPeriodForExport } from "@/lib/financialYear";
import { useFinancialYearRule } from "@/hooks/useFinancialYearRule";
import { formatCurrencyAmount, getCurrencyConfig } from "@/lib/currency";
import { invalidateAfterCustomerPaymentRecorded } from "@/lib/invalidatePaymentCaches";
import { getBillSalesmanDisplayName, resolvePaymentSalesmanName } from "@/lib/billSalesman";
import { sortByLocaleKey } from "@/lib/utils";
import { useAuth } from "@/lib/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { activePaymentMethodsSorted, defaultPaymentMethodName as pickDefaultPaymentMethod, paymentMethodSelectValue } from "@/lib/paymentMethodUi";
import {
  aggregateBillDeliveryStatusForPaymentRow,
  buildDeliveredLineItemPaymentPatch,
} from "@/lib/deliveredLinePayment";
import { computeBillCustomerBalance } from "@/lib/paymentBalance";

/**
 * Record payment for a delivered-unpaid line item (DB reads after each step for safe bulk use).
 */
async function recordDeliveredUnpaidLineItemPayment({ itemId, amount, date, method, collected_by_name, recordedBy }) {
  if (!amount || amount <= 0) throw new Error("Amount required");
  if (!date) throw new Error("Date required");
  if (!String(method || "").trim()) throw new Error("Payment method is required");
  if (!String(collected_by_name || "").trim()) throw new Error("Collected By is required");

  const item = await db.BillItem.get(itemId);
  if (!item) throw new Error("Line item not found");

  let bill = null;
  if (item.bill_id) {
    try {
      bill = await db.Bill.get(item.bill_id);
    } catch {
      bill = null;
    }
  }

  let paymentId = null;
  try {
    const paymentRow = await db.PaymentCollection.create({
      date,
      customer_id: bill?.customer_id ?? null,
      customer_name: bill?.customer_name ?? "",
      bill_id: item.bill_id ?? null,
      bill_number: item.bill_number ?? "",
      method: String(method).trim(),
      amount,
      collected_by_name: String(collected_by_name).trim(),
      collected_by_id: null,
      recorded_by: recordedBy || "",
      entry_timestamp: new Date().toISOString(),
      salesman_name: getBillSalesmanDisplayName(bill),
    });
    paymentId = paymentRow?.id ?? null;

    const linePatch = buildDeliveredLineItemPaymentPatch(
      item,
      amount,
      date,
      method,
      collected_by_name
    );
    await db.BillItem.update(itemId, linePatch);

    if (item.bill_id && bill) {
      const allItems = await db.BillItem.filter({ bill_id: item.bill_id });
      const totalPaid = allItems.reduce((s, i) => s + (Number(i.payment_amount) || 0), 0);
      const billTotal = bill.total_amount || 0;
      const { amount_paid: newAmountPaid, amount_due: newAmountDue, payment_status: paymentStatus } =
        computeBillCustomerBalance(billTotal, totalPaid);
      await db.Bill.update(bill.id, {
        amount_paid: newAmountPaid,
        amount_due: newAmountDue,
        payment_status: paymentStatus,
      });
    }
  } catch (err) {
    if (paymentId) await db.PaymentCollection.delete(paymentId).catch(() => {});
    await db.BillItem
      .update(itemId, {
        delivery_status: "delivered_unpaid",
        payment_amount: null,
        payment_method: null,
        payment_collected_by_name: null,
        payment_date: null,
      })
      .catch(() => {});
    throw err;
  }
}

/** After a collection payment, mark delivered-unpaid lines paid when the bill is fully settled. */
async function syncDeliveredUnpaidLineItemsWhenBillFullyPaid(billId, paymentCtx) {
  const bill = await db.Bill.get(billId).catch(() => null);
  if (!bill || (bill.amount_due || 0) > 0) return;
  if (bill.payment_status !== "paid" && bill.payment_status !== "paid_excess") return;
  const items = await db.BillItem.filter({ bill_id: billId });
  const method = String(paymentCtx.method || "").trim();
  const collected = String(paymentCtx.collected_by_name || "").trim();
  const paymentDate = paymentCtx.date || format(new Date(), "yyyy-MM-dd");
  for (const item of items) {
    if (item.delivery_status !== "delivered_unpaid") continue;
    await db.BillItem.update(item.id, {
      delivery_status: "delivered_paid",
      payment_amount: item.amount || 0,
      payment_method: method,
      payment_collected_by_name: collected,
      payment_date: paymentDate,
    });
  }
}

export default function PaymentCollectionPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { can } = usePermissions();
  const canDeletePayments = can("payment_collection", "delete");
  const canEditPayments = can("payment_collection", "edit");
  const canCustomerPayment = can("payment_collection", "customer_payment");
  const { rule } = useFinancialYearRule();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [confirmAction, setConfirmAction] = useState(null);
  const [progress, setProgress] = useState({ open: false, current: 0, total: 0 });
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [itemPaymentDialog, setItemPaymentDialog] = useState(null);
  const [bulkPendingDialog, setBulkPendingDialog] = useState(null);

  const emptyForm = { date: format(new Date(), 'yyyy-MM-dd'), customer_id: '', customer_name: '', bill_id: '', bill_number: '', method: '', amount: 0, collected_by_id: '', collected_by_name: '', payment_proof_url: '', reference: '', salesman_name: '' };
  const [form, setForm] = useState(emptyForm);

  const { data: payments = [], isLoading } = useQuery({
    queryKey: ['payments-all', 'collection'],
    queryFn: () => db.PaymentCollection.list('-date', 500),
  });

  const { data: customers = [] } = useQuery({
    queryKey: ['customers-active'],
    queryFn: async () => {
      let { data, error } = await supabase
        .from('customer')
        .select('*')
        .or('status.eq.active,status.is.null');
      if (error && (error.code === 'PGRST205' || /could not find the table .* in the schema cache/i.test(error.message || ''))) {
        ({ data, error } = await supabase
          .from('customers')
          .select('*')
          .or('status.eq.active,status.is.null'));
      }
      if (error) throw error;
      return data || [];
    }
  });

  // ALL employees (not just sales) for "Collected By"
  const { data: allEmployees = [] } = useQuery({
    queryKey: ['employees-active'],
    queryFn: () => db.Employee.filter({ status: 'active' })
  });

  const { data: billItemsDelivery = [] } = useQuery({
    queryKey: ['bill-items-delivery'],
    queryFn: () => db.BillItem.list('-created_date', 2000),
    staleTime: 60 * 1000,
  });

  const { data: bills = [] } = useQuery({
    queryKey: ['bills-all'],
    queryFn: () => db.Bill.list('-bill_date', 500),
  });

  const { data: companySettings = [] } = useQuery({
    queryKey: ['company-settings'],
    queryFn: async () => {
      const { data } = await supabase.from('company_settings').select('*');
      return data || [];
    }
  });

  const { data: paymentMethods } = usePaymentMethodsQuery();
  const paymentMethodsList = paymentMethods ?? [];

  const settings = companySettings[0] || {};
  const curCode = getCurrencyConfig(settings).code;
  // Sort payment methods alphabetically (dynamic from Company Settings)
  const sortedPaymentMethods = useMemo(
    () => activePaymentMethodsSorted(paymentMethodsList),
    [paymentMethodsList]
  );
  const defaultPmName = useMemo(() => pickDefaultPaymentMethod(paymentMethodsList), [paymentMethodsList]);

  const salesDeliveryEmployees = useMemo(
    () => sortByLocaleKey(allEmployees.filter((e) => e.role === "sales_delivery")),
    [allEmployees]
  );

  const deliveredUnpaidLineItems = useMemo(
    () => billItemsDelivery.filter((i) => i.delivery_status === "delivered_unpaid"),
    [billItemsDelivery]
  );

  const customersSorted = useMemo(() => sortByLocaleKey(customers), [customers]);

  const filteredPayments = useMemo(
    () =>
      payments.filter((p) => {
        if (dateFrom && p.date < dateFrom) return false;
        if (dateTo && p.date > dateTo) return false;
        return true;
      }),
    [payments, dateFrom, dateTo]
  );

  const billsById = useMemo(() => Object.fromEntries(bills.map(b => [b.id, b])), [bills]);

  /** Fix lines left delivered_unpaid after bill was fully paid via the main collection form (legacy mismatch). */
  const orphanLineSyncKey = useRef("");
  useEffect(() => {
    if (!billItemsDelivery.length || !Object.keys(billsById).length) return;
    const orphans = billItemsDelivery.filter((i) => {
      if (i.delivery_status !== "delivered_unpaid") return false;
      const b = billsById[i.bill_id];
      return b && (b.payment_status === "paid" || b.payment_status === "paid_excess") && (b.amount_due || 0) <= 0;
    });
    if (!orphans.length) return;
    const key = orphans
      .map((o) => o.id)
      .sort()
      .join(",");
    if (orphanLineSyncKey.current === key) return;
    orphanLineSyncKey.current = key;
    (async () => {
      try {
        for (const item of orphans) {
          const pays = await db.PaymentCollection.filter({ bill_id: item.bill_id });
          const last = [...pays].sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))[0];
          if (!last) continue;
          await db.BillItem.update(item.id, {
            delivery_status: "delivered_paid",
            payment_amount: item.amount || 0,
            payment_method: String(last.method || "").trim(),
            payment_collected_by_name: String(last.collected_by_name || "").trim(),
            payment_date: last.date || format(new Date(), "yyyy-MM-dd"),
          });
        }
        qc.invalidateQueries({ queryKey: ["bill-items-delivery"] });
      } catch {
        orphanLineSyncKey.current = "";
      }
    })();
  }, [billItemsDelivery, billsById, qc]);

  const pendingLineItemsForTable = useMemo(() => {
    return deliveredUnpaidLineItems.filter((item) => {
      const bill = billsById[item.bill_id];
      const d = bill?.bill_date || "";
      if (dateFrom && d < dateFrom) return false;
      if (dateTo && d > dateTo) return false;
      return true;
    });
  }, [deliveredUnpaidLineItems, billsById, dateFrom, dateTo]);

  const unifiedTableRows = useMemo(() => {
    const pendingRows = pendingLineItemsForTable.map((lineItem) => ({
      id: `pending:${lineItem.id}`,
      rowKind: "pending",
      lineItem,
    }));
    const paymentRows = filteredPayments.map((payment) => ({
      id: payment.id,
      rowKind: "collection",
      payment,
    }));
    return [...pendingRows, ...paymentRows];
  }, [pendingLineItemsForTable, filteredPayments]);

  const selectedPaymentIds = useMemo(
    () => selectedIds.filter((id) => !String(id).startsWith("pending:")),
    [selectedIds]
  );

  const selectedPendingLineItems = useMemo(() => {
    const sel = new Set(selectedIds);
    return unifiedTableRows
      .filter((r) => r.rowKind === "pending" && sel.has(r.id))
      .map((r) => r.lineItem);
  }, [unifiedTableRows, selectedIds]);

  // Recalculate and sync bill payment status
  const updateBillStatus = async (billId) => {
    const bill = billsById[billId];
    if (!bill) return;
    const allPaymentsForBill = await db.PaymentCollection.filter({ bill_id: billId });
    const totalPaid = (allPaymentsForBill || []).reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const billTotal = bill.total_amount || 0;
    const { amount_paid: amountPaid, amount_due: amountDue, payment_status: paymentStatus } =
      computeBillCustomerBalance(billTotal, totalPaid);
    await db.Bill.update(billId, { amount_paid: amountPaid, amount_due: amountDue, payment_status: paymentStatus });
  };

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      if (!String(data.method || "").trim()) throw new Error("Payment method is required");
      if (!String(data.collected_by_name || "").trim()) throw new Error("Collected By is required");
      const { data: { user: authUser } } = await supabase.auth.getUser();
      const payload = {
        ...data,
        method: String(data.method).trim(),
        collected_by_name: String(data.collected_by_name).trim(),
        collected_by_id: data.collected_by_id || null,
        recorded_by: authUser?.email || '',
        entry_timestamp: new Date().toISOString(),
      };
      if (editingId) {
        await db.PaymentCollection.update(editingId, payload);
      } else {
        await db.PaymentCollection.create(payload);
      }
      if (data.bill_id) {
        await updateBillStatus(data.bill_id);
        await syncDeliveredUnpaidLineItemsWhenBillFullyPaid(data.bill_id, {
          method: payload.method,
          collected_by_name: payload.collected_by_name,
          date: payload.date,
        });
      }
    },
    onSuccess: () => {
      invalidateAfterCustomerPaymentRecorded(qc);
      setShowForm(false);
      setEditingId(null);
      toast.success(editingId ? "Updated" : "Payment recorded");
    },
    onError: (err) => {
      toast.error(err?.message || 'Failed to save payment');
    }
  });

  const recordLineItemPaymentMutation = useMutation({
    mutationFn: async (data) => {
      const { data: auth } = await supabase.auth.getUser();
      const recordedBy = auth?.user?.email || user?.email || "";
      await recordDeliveredUnpaidLineItemPayment({
        itemId: data.itemId,
        amount: data.amount,
        date: data.date,
        method: data.method,
        collected_by_name: data.collected_by_name,
        recordedBy,
      });
    },
    onSuccess: () => {
      invalidateAfterCustomerPaymentRecorded(qc);
      qc.invalidateQueries({ queryKey: ["bill-items-delivery"] });
      setItemPaymentDialog(null);
      toast.success("Payment recorded");
    },
    onError: (err) => toast.error(err?.message || "Could not record payment"),
  });

  const bulkPendingPaymentMutation = useMutation({
    mutationFn: async (dialog) => {
      const { items, amounts, date, method, collected_by_name } = dialog;
      const { data: auth } = await supabase.auth.getUser();
      const recordedBy = auth?.user?.email || user?.email || "";
      for (const item of items) {
        const amt = Number(amounts[item.id]);
        if (!amt || amt <= 0) {
          throw new Error(`Enter a positive amount for each line (bill #${item.bill_number || ""} — ${item.item_name || "item"})`);
        }
        await recordDeliveredUnpaidLineItemPayment({
          itemId: item.id,
          amount: amt,
          date,
          method,
          collected_by_name,
          recordedBy,
        });
      }
    },
    onSuccess: () => {
      invalidateAfterCustomerPaymentRecorded(qc);
      qc.invalidateQueries({ queryKey: ["bill-items-delivery"] });
      setBulkPendingDialog(null);
      setSelectedIds([]);
      toast.success("Payments recorded");
    },
    onError: (err) => toast.error(err?.message || "Could not record payments"),
  });

  const softDelete = useSoftDelete({
    entityName: 'PaymentCollection',
    tableName: 'payment_collections',
    fallbackTableName: 'payment_collection',
    getDisplayName: r => `Bill #${r.bill_number} — ${r.customer_name} ${formatCurrencyAmount(r.amount, settings)}`,
    invalidateKeys: [['payments-all']],
    onSuccess: () => setSelectedIds([]),
  });

  const handleDelete = async (ids) => {
    const affectedBillIds = [...new Set(ids.map(id => payments.find(p => p.id === id)?.bill_id).filter(Boolean))];
    const records = payments.filter(p => ids.includes(p.id));
    setProgress({ open: true, current: 0, total: ids.length });
    softDelete.mutate({ ids, records, onProgress: (cur, tot) => setProgress({ open: true, current: cur, total: tot }) }, {
      onSettled: async () => {
        setProgress({ open: false, current: 0, total: 0 });
        for (const billId of affectedBillIds) await updateBillStatus(billId);
        invalidateAfterCustomerPaymentRecorded(qc);
      }
    });
  };

  const handleEdit = (p) => {
    const bill = bills.find(b => b.id === p.bill_id);
    setForm({
      date: p.date || '',
      customer_id: p.customer_id || '',
      customer_name: p.customer_name || '',
      bill_id: p.bill_id || '',
      bill_number: p.bill_number || '',
      method: p.method || defaultPmName,
      amount: p.amount || 0,
      collected_by_id: p.collected_by_id || '',
      collected_by_name: p.collected_by_name || '',
      payment_proof_url: p.payment_proof_url || '',
      reference: p.reference || '',
      salesman_name: resolvePaymentSalesmanName(p, bill) || getBillSalesmanDisplayName(bill),
    });
    setEditingId(p.id);
    setShowForm(true);
  };

  const selectCustomer = (id) => {
    const c = customers.find(c => c.id === id);
    setForm(f => ({ ...f, customer_id: id, customer_name: c?.name || '', bill_id: '', bill_number: '', amount: 0, salesman_name: '' }));
  };

  const selectBill = (id) => {
    const b = bills.find(b => b.id === id);
    const due = Number(b?.amount_due) || 0;
    setForm(f => ({
      ...f,
      bill_id: id,
      bill_number: b?.bill_number || '',
      amount: due > 0 ? due : 0,
      salesman_name: getBillSalesmanDisplayName(b),
    }));
  };

  const customerBills = useMemo(() => {
    if (!form.customer_id) return [];
    return sortByLocaleKey(
      bills.filter(
        (b) =>
          b.customer_id === form.customer_id &&
          !((b.payment_status === "paid" || b.payment_status === "paid_excess") && (b.amount_due || 0) === 0)
      ),
      "bill_number"
    );
  }, [bills, form.customer_id]);

  const openBulkPendingPaymentDialog = () => {
    const items = selectedPendingLineItems;
    if (!items.length) return;
    const amounts = {};
    items.forEach((i) => {
      amounts[i.id] = i.amount || 0;
    });
    setBulkPendingDialog({
      items,
      amounts,
      method: defaultPmName,
      collected_by_name: "",
      date: format(new Date(), "yyyy-MM-dd"),
    });
  };

  const columns = [
    {
      key: "delivery",
      header: "Delivery status",
      sortable: true,
      accessor: (r) =>
        r.rowKind === "pending"
          ? r.lineItem.delivery_status || ""
          : aggregateBillDeliveryStatusForPaymentRow(r.payment.bill_id, billItemsDelivery) || "",
      render: (r) => {
        if (r.rowKind === "pending") {
          return <StatusBadge status={r.lineItem.delivery_status} />;
        }
        const agg = aggregateBillDeliveryStatusForPaymentRow(r.payment.bill_id, billItemsDelivery);
        return agg ? (
          <StatusBadge status={agg} />
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        );
      },
    },
    {
      key: "date",
      header: "Date",
      sortable: true,
      accessor: (r) =>
        r.rowKind === "collection" ? r.payment.date : billsById[r.lineItem.bill_id]?.bill_date || "",
      render: (r) =>
        r.rowKind === "collection" ? (
          r.payment.date
        ) : (
          <span className="text-xs text-muted-foreground" title="Bill date (line not yet paid)">
            {billsById[r.lineItem.bill_id]?.bill_date || "—"}
          </span>
        ),
    },
    {
      key: "customer",
      header: "Customer",
      sortable: true,
      accessor: (r) =>
        r.rowKind === "collection"
          ? r.payment.customer_name
          : billsById[r.lineItem.bill_id]?.customer_name || "",
    },
    {
      key: "salesman",
      header: "Salesman",
      sortable: true,
      accessor: (r) =>
        r.rowKind === "collection"
          ? resolvePaymentSalesmanName(r.payment, billsById[r.payment.bill_id]) || ""
          : getBillSalesmanDisplayName(billsById[r.lineItem.bill_id]) || "",
      render: (r) =>
        r.rowKind === "collection"
          ? resolvePaymentSalesmanName(r.payment, billsById[r.payment.bill_id]) || "—"
          : getBillSalesmanDisplayName(billsById[r.lineItem.bill_id]) || "—",
    },
    {
      key: "bill",
      header: "Bill #",
      sortable: true,
      accessor: (r) => (r.rowKind === "collection" ? r.payment.bill_number : r.lineItem.bill_number),
    },
    {
      key: "item",
      header: "Item",
      accessor: (r) => (r.rowKind === "collection" ? "" : r.lineItem.item_name || ""),
      render: (r) =>
        r.rowKind === "collection" ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <span className="text-xs">{r.lineItem.item_name}</span>
        ),
    },
    {
      key: "method",
      header: "Method",
      accessor: (r) => (r.rowKind === "collection" ? r.payment.method : ""),
      render: (r) =>
        r.rowKind === "collection" ? (
          <span className="capitalize">{r.payment.method}</span>
        ) : (
          <span className="text-muted-foreground text-xs">—</span>
        ),
    },
    {
      key: "amount",
      header: "Amount",
      sortable: true,
      accessor: (r) => (r.rowKind === "collection" ? r.payment.amount || 0 : r.lineItem.amount || 0),
      render: (r) =>
        formatCurrencyAmount(
          r.rowKind === "collection" ? r.payment.amount || 0 : r.lineItem.amount || 0,
          settings
        ),
    },
    {
      key: "pending",
      header: "Bill Total / Pending",
      accessor: (r) => {
        const billId = r.rowKind === "collection" ? r.payment.bill_id : r.lineItem.bill_id;
        const bill = bills.find((b) => b.id === billId);
        return bill ? `${bill.total_amount}|${bill.amount_due}` : "";
      },
      render: (r) => {
        const billId = r.rowKind === "collection" ? r.payment.bill_id : r.lineItem.bill_id;
        const bill = bills.find((b) => b.id === billId);
        if (!bill) return "-";
        return (
          <span className="text-xs">
            {formatCurrencyAmount(bill.total_amount || 0, settings)} /{" "}
            <span className={bill.amount_due > 0 ? "text-amber-600 font-medium" : bill.amount_due < 0 ? "text-sky-700 font-medium" : "text-emerald-600"}>
              {formatCurrencyAmount(bill.amount_due || 0, settings)}
            </span>
          </span>
        );
      },
    },
    {
      key: "bill_payment",
      header: "Bill payment",
      accessor: (r) => {
        const billId = r.rowKind === "collection" ? r.payment.bill_id : r.lineItem.bill_id;
        const bill = bills.find((b) => b.id === billId);
        return bill?.payment_status || "";
      },
      render: (r) => {
        const billId = r.rowKind === "collection" ? r.payment.bill_id : r.lineItem.bill_id;
        const bill = bills.find((b) => b.id === billId);
        if (!bill) return "-";
        return <StatusBadge status={bill.payment_status} />;
      },
    },
    {
      key: "collected_by",
      header: "Collected By",
      accessor: (r) => (r.rowKind === "collection" ? r.payment.collected_by_name : ""),
      render: (r) =>
        r.rowKind === "collection" ? r.payment.collected_by_name || "—" : <span className="text-muted-foreground">—</span>,
    },
    {
      key: "recorded_by",
      header: "Recorded By",
      accessor: (r) => (r.rowKind === "collection" ? r.payment.recorded_by : ""),
      render: (r) =>
        r.rowKind === "collection" ? r.payment.recorded_by || "—" : <span className="text-muted-foreground">—</span>,
    },
    {
      key: "actions",
      header: "",
      render: (r) => {
        if (r.rowKind === "collection") {
          return canEditPayments ? (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={(e) => {
                e.stopPropagation();
                handleEdit(r.payment);
              }}
            >
              <Pencil className="w-3.5 h-3.5" />
            </Button>
          ) : null;
        }
        const bill = bills.find((b) => b.id === r.lineItem.bill_id);
        if (
          (bill?.payment_status === "paid" || bill?.payment_status === "paid_excess") &&
          (bill.amount_due || 0) <= 0
        ) {
          return <span className="text-xs text-muted-foreground">—</span>;
        }
        return canCustomerPayment ? (
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={(e) => {
              e.stopPropagation();
              setItemPaymentDialog({
                itemId: r.lineItem.id,
                amount: r.lineItem.amount || 0,
                method: defaultPmName,
                collected_by_name: "",
                date: format(new Date(), "yyyy-MM-dd"),
              });
            }}
          >
            Record
          </Button>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        );
      },
    },
  ];

  return (
    <div>
      <PageHeader title="Payment Collection" subtitle="Record and manage payment collections"
        permissionResource="payment_collection"
        dateRange={formatPeriodForExport(dateFrom, dateTo, rule)}
        exportData={filteredPayments.map(p => ({
          Date: p.date,
          Customer: p.customer_name,
          Salesman: resolvePaymentSalesmanName(p, billsById[p.bill_id]),
          'Bill #': p.bill_number,
          Method: p.method,
          Amount: p.amount || 0,
          'Collected By': p.collected_by_name || '',
          'Recorded By': p.recorded_by || '',
        }))}>
        {canDeletePayments && selectedPaymentIds.length > 0 && (
          <Button variant="outline" size="sm" className="gap-1 text-destructive" onClick={() => setConfirmAction({ ids: selectedPaymentIds })}>
            <Trash2 className="w-3.5 h-3.5" /> Delete ({selectedPaymentIds.length})
          </Button>
        )}
        {selectedPendingLineItems.length > 0 && canCustomerPayment && (
          <Button variant="outline" size="sm" className="gap-1" onClick={openBulkPendingPaymentDialog}>
            Record payment ({selectedPendingLineItems.length})
          </Button>
        )}
        {canCustomerPayment && (
        <Button size="sm" className="gap-1" onClick={() => { setForm({ ...emptyForm, method: defaultPmName }); setEditingId(null); setShowForm(true); }}>
          <Plus className="w-4 h-4" /> Record Payment
        </Button>
        )}
      </PageHeader>

      <div className="flex gap-3 mb-4 items-end">
        <div><Label className="text-xs">From</Label><Input type="date" className="h-9 w-40" value={dateFrom} onChange={e => setDateFrom(e.target.value)} /></div>
        <div><Label className="text-xs">To</Label><Input type="date" className="h-9 w-40" value={dateTo} onChange={e => setDateTo(e.target.value)} /></div>
        {(dateFrom || dateTo) && <Button variant="ghost" size="sm" onClick={() => { setDateFrom(''); setDateTo(''); }}>Clear</Button>}
      </div>

      <DataTable
        columns={columns}
        data={unifiedTableRows}
        loading={isLoading}
        selectable
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
        searchPlaceholder="Search payments and due lines..."
      />

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editingId ? "Edit" : "Record"} Payment</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Date *</Label><Input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></div>
              <div>
                <Label>Payment method *</Label>
                <Select value={paymentMethodSelectValue(form.method, sortedPaymentMethods, defaultPmName)} onValueChange={v => setForm({ ...form, method: v })}>
                  <SelectTrigger><SelectValue placeholder="Select method" /></SelectTrigger>
                  <SelectContent>
                    {sortedPaymentMethods.map(m => <SelectItem key={m.id} value={m.name}>{m.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Customer *</Label>
                <Select value={form.customer_id} onValueChange={selectCustomer}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>{customersSorted.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Bill # {customerBills.length > 0 && (() => {
                  const owing = customerBills.filter((b) => (b.amount_due || 0) > 0).length;
                  const credit = customerBills.filter((b) => (b.amount_due || 0) < 0).length;
                  const parts = [];
                  if (owing) parts.push(`${owing} owing`);
                  if (credit) parts.push(`${credit} credit`);
                  return <span className="text-xs text-muted-foreground">({parts.join(", ") || "open"})</span>;
                })()}</Label>
                <Select value={form.bill_id} onValueChange={selectBill} disabled={!form.customer_id}>
                  <SelectTrigger><SelectValue placeholder="Select bill" /></SelectTrigger>
                  <SelectContent>
                    {customerBills.map(b => (
                      <SelectItem key={b.id} value={b.id}>
                        #{b.bill_number} — Due: {formatCurrencyAmount(b.amount_due || 0, settings)}
                        {(b.amount_due || 0) < 0 ? " (credit)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {form.bill_id && (() => {
              const bill = bills.find(b => b.id === form.bill_id);
              return bill ? (
                <div className="bg-muted/40 rounded-lg px-3 py-2 text-sm space-y-1">
                  <div className="flex gap-4 flex-wrap">
                    <span>Total: <strong>{formatCurrencyAmount(bill.total_amount || 0, settings)}</strong></span>
                    <span>Paid: <strong>{formatCurrencyAmount(bill.amount_paid || 0, settings)}</strong></span>
                    <span>
                      Due:{" "}
                      <strong
                        className={
                          (bill.amount_due || 0) > 0
                            ? "text-amber-600"
                            : (bill.amount_due || 0) < 0
                              ? "text-sky-700"
                              : "text-emerald-600"
                        }
                      >
                        {formatCurrencyAmount(bill.amount_due || 0, settings)}
                      </strong>
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Salesman (pickup): <span className="font-medium text-foreground">{form.salesman_name || getBillSalesmanDisplayName(bill) || '—'}</span>
                  </p>
                </div>
              ) : null;
            })()}
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Amount ({curCode}) *</Label><Input type="number" value={form.amount} onChange={e => setForm({ ...form, amount: Number(e.target.value) })} /></div>
              <div>
                <Label>Collected By *</Label>
                <Input
                  className="h-9"
                  list="payment-collection-collected-by"
                  placeholder="Pick a sales-delivery name from suggestions or type any name"
                  value={form.collected_by_name}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      collected_by_name: e.target.value,
                      collected_by_id: "",
                    }))
                  }
                />
                <datalist id="payment-collection-collected-by">
                  {salesDeliveryEmployees.map((e) => (
                    <option key={e.id} value={e.name} />
                  ))}
                </datalist>
              </div>
            </div>
            <div><Label>Reference</Label><Input value={form.reference} onChange={e => setForm({ ...form, reference: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button onClick={() => saveMutation.mutate(form)} disabled={!form.date || !form.customer_id || !form.amount || !String(form.method || '').trim() || !String(form.collected_by_name || '').trim() || saveMutation.isPending}>
              {editingId ? "Update" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!itemPaymentDialog} onOpenChange={(open) => { if (!open) setItemPaymentDialog(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Record line-item payment</DialogTitle>
          </DialogHeader>
          {itemPaymentDialog && (
            <>
              <div className="grid gap-4 py-2">
                <div>
                  <Label>Amount ({curCode})</Label>
                  <Input
                    type="number"
                    value={itemPaymentDialog.amount}
                    onChange={(e) =>
                      setItemPaymentDialog((p) => ({ ...p, amount: Number(e.target.value) }))
                    }
                  />
                </div>
                <div>
                  <Label>Date *</Label>
                  <Input
                    type="date"
                    value={itemPaymentDialog.date}
                    onChange={(e) =>
                      setItemPaymentDialog((p) => ({ ...p, date: e.target.value }))
                    }
                  />
                </div>
                <div>
                  <Label>Payment method *</Label>
                  <Select
                    value={paymentMethodSelectValue(itemPaymentDialog.method, sortedPaymentMethods, defaultPmName)}
                    onValueChange={(v) =>
                      setItemPaymentDialog((p) => ({ ...p, method: v }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select method" />
                    </SelectTrigger>
                    <SelectContent>
                      {sortedPaymentMethods.map((m) => (
                        <SelectItem key={m.id} value={m.name}>
                          {m.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Collected By *</Label>
                  <Input
                    className="h-9"
                    list="payment-collection-item-collected-by"
                    placeholder="Sales delivery or other name"
                    value={itemPaymentDialog.collected_by_name}
                    onChange={(e) =>
                      setItemPaymentDialog((p) => ({
                        ...p,
                        collected_by_name: e.target.value,
                      }))
                    }
                  />
                  <datalist id="payment-collection-item-collected-by">
                    {salesDeliveryEmployees.map((e) => (
                      <option key={e.id} value={e.name} />
                    ))}
                  </datalist>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setItemPaymentDialog(null)}>
                  Cancel
                </Button>
                <Button
                  onClick={() => recordLineItemPaymentMutation.mutate(itemPaymentDialog)}
                  disabled={
                    recordLineItemPaymentMutation.isPending ||
                    !itemPaymentDialog?.date ||
                    !String(itemPaymentDialog?.method || "").trim() ||
                    !String(itemPaymentDialog?.collected_by_name || "").trim()
                  }
                >
                  Save payment
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {bulkPendingDialog && (
        <Dialog open onOpenChange={() => setBulkPendingDialog(null)}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Record payment — {bulkPendingDialog.items.length} line item(s)</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50 border-b text-xs text-muted-foreground">
                      <th className="text-left px-3 py-2">Bill #</th>
                      <th className="text-left px-3 py-2">Customer</th>
                      <th className="text-left px-3 py-2">Item</th>
                      <th className="text-right px-3 py-2">Qty</th>
                      <th className="text-right px-3 py-2 w-32">Amount ({curCode})</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bulkPendingDialog.items.map((item) => {
                      const bill = billsById[item.bill_id];
                      return (
                        <tr key={item.id} className="border-b last:border-0">
                          <td className="px-3 py-2 font-medium">{item.bill_number}</td>
                          <td className="px-3 py-2 text-muted-foreground">{bill?.customer_name || "—"}</td>
                          <td className="px-3 py-2">{item.item_name}</td>
                          <td className="px-3 py-2 text-right">{item.quantity}</td>
                          <td className="px-3 py-2">
                            <Input
                              type="number"
                              className="h-7 text-xs text-right w-28"
                              value={bulkPendingDialog.amounts[item.id] ?? 0}
                              onChange={(e) =>
                                setBulkPendingDialog((prev) => ({
                                  ...prev,
                                  amounts: { ...prev.amounts, [item.id]: Number(e.target.value) },
                                }))
                              }
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <Label>Date *</Label>
                  <Input
                    type="date"
                    value={bulkPendingDialog.date}
                    onChange={(e) =>
                      setBulkPendingDialog((prev) => ({ ...prev, date: e.target.value }))
                    }
                  />
                </div>
                <div>
                  <Label>Payment method *</Label>
                  <Select
                    value={paymentMethodSelectValue(bulkPendingDialog.method, sortedPaymentMethods, defaultPmName)}
                    onValueChange={(v) => setBulkPendingDialog((prev) => ({ ...prev, method: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select method" />
                    </SelectTrigger>
                    <SelectContent>
                      {sortedPaymentMethods.map((m) => (
                        <SelectItem key={m.id} value={m.name}>
                          {m.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Collected By *</Label>
                  <Input
                    className="h-9"
                    list="payment-collection-bulk-collected-by"
                    placeholder="Sales delivery or other name"
                    value={bulkPendingDialog.collected_by_name}
                    onChange={(e) =>
                      setBulkPendingDialog((prev) => ({ ...prev, collected_by_name: e.target.value }))
                    }
                  />
                  <datalist id="payment-collection-bulk-collected-by">
                    {salesDeliveryEmployees.map((e) => (
                      <option key={e.id} value={e.name} />
                    ))}
                  </datalist>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setBulkPendingDialog(null)}>
                Cancel
              </Button>
              <Button
                onClick={() => bulkPendingPaymentMutation.mutate(bulkPendingDialog)}
                disabled={
                  bulkPendingPaymentMutation.isPending ||
                  !bulkPendingDialog?.date ||
                  !String(bulkPendingDialog?.method || "").trim() ||
                  !String(bulkPendingDialog?.collected_by_name || "").trim() ||
                  !bulkPendingDialog.items.some((it) => Number(bulkPendingDialog.amounts[it.id]) > 0)
                }
              >
                Save payments
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      <ConfirmModal open={!!confirmAction} onClose={() => setConfirmAction(null)}
        onConfirm={() => { handleDelete(confirmAction.ids); setConfirmAction(null); }}
        title="Move to Trash?" description={`Move ${confirmAction?.ids?.length || 0} payment(s) to Trash? Bill amounts will be recalculated.`}
        confirmText="Move to Trash" destructive />
      <ProgressModal open={progress.open} title="Moving to Trash..." current={progress.current} total={progress.total} />
    </div>
  );
}
