import React, { useState, useMemo } from "react";
import { db, sendEmail } from "@/services/SupabaseService";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { usePaymentMethodsQuery } from "@/hooks/usePaymentMethodsQuery";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import PageHeader from "@/components/shared/PageHeader";
import { generatePdfBase64 } from "@/utils/generatePdfBase64";
import ConfirmModal from "@/components/shared/ConfirmModal";
import ProgressModal from "@/components/shared/ProgressModal";
import { useSoftDelete } from "@/hooks/useSoftDelete";
import ReminderModal from "@/components/shared/ReminderModal";
import DeliveryTable from "@/components/delivery/DeliveryTable";
import { Package, Truck, CreditCard, ListChecks, Trash2, Bell } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import StatusBadge from "@/components/shared/StatusBadge";
import { toast } from "sonner";
import { format } from "date-fns";
import { useAuth } from "@/lib/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { formatCurrencyAmount, getCurrencyConfig } from "@/lib/currency";
import { invalidateAfterCustomerPaymentRecorded } from "@/lib/invalidatePaymentCaches";
import { getBillSalesmanDisplayName } from "@/lib/billSalesman";
import { buildWhatsappMeUrl } from "@/lib/whatsappLink";
import { sortByLocaleKey, sortStringsForDisplay } from "@/lib/utils";
import { buildDeliveredLineItemPaymentPatch } from "@/lib/deliveredLinePayment";
import { useCommunicationTemplates } from "@/hooks/useCommunicationTemplates";
import {
  buildJobReminderVars,
  getDefaultEmailTemplate,
  resolveRenderedMessage,
} from "@/lib/communicationTemplate";
import { computeBillCustomerBalance } from "@/lib/paymentBalance";
import { activePaymentMethodsSorted, defaultPaymentMethodName as pickDefaultPaymentMethod, paymentMethodSelectValue } from "@/lib/paymentMethodUi";

export default function DeliveryManagement() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { can } = usePermissions();
  const canDeleteDelivery = can("delivery", "delete");
  const canDeliveryStatus = can("delivery", "delivery_status");
  const canDeliveryCustomerPayment = can("delivery", "delivery_customer_payment");
  const canDeliveryReminderSend = can("delivery", "delivery_reminder_send");
  const canReminderLogDelete = can("delivery", "reminder_log_delete");
  const [tab, setTab] = useState("vendor_orders");
  const [selectedIds, setSelectedIds] = useState([]);
  const [paymentDialog, setPaymentDialog] = useState(null);
  const [bulkPaymentDialog, setBulkPaymentDialog] = useState(null);
  const [deliveryEmployee, setDeliveryEmployee] = useState('');
  const [deliveryDate, setDeliveryDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [rowDeliveryEmployee, setRowDeliveryEmployee] = useState({});
  const [rowDeliveryDate, setRowDeliveryDate] = useState({});
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [itemTrashProgress, setItemTrashProgress] = useState({ open: false, current: 0, total: 0 });
  const [statusDateFrom, setStatusDateFrom] = useState('');
  const [statusDateTo, setStatusDateTo] = useState('');
  const [reminderModal, setReminderModal] = useState(null);
  const [vendorFilter, setVendorFilter] = useState('');
  const [deliveryReminderRecipientFilter, setDeliveryReminderRecipientFilter] = useState('');
  const [selectedLogIds, setSelectedLogIds] = useState([]);
  const [confirmDeleteLogs, setConfirmDeleteLogs] = useState(false);

  const { data: billItems = [] } = useQuery({ queryKey: ['bill-items-delivery'], queryFn: () => db.BillItem.list('-created_date', 2000), staleTime: 60 * 1000 });
  const { data: vendorOrders = [] } = useQuery({
    queryKey: ['vendor-orders-delivery'],
    queryFn: () => db.VendorOrder.list('-order_date', 500),
    staleTime: 60 * 1000,
  });
  const { data: bills = [] } = useQuery({ queryKey: ['bills-delivery'], queryFn: () => db.Bill.list('-created_date', 200), staleTime: 10 * 60 * 1000 });
  const { data: employees = [] } = useQuery({ queryKey: ['employees-active'], queryFn: () => db.Employee.filter({ status: 'active' }), staleTime: 20 * 60 * 1000 });
  const { data: vendorBillings = [] } = useQuery({ queryKey: ['vendor-billings'], queryFn: () => db.VendorBilling.list('-created_date', 200), staleTime: 10 * 60 * 1000 });
  const { data: vendors = [] } = useQuery({ queryKey: ['vendors-all'], queryFn: () => db.Vendor.list(), staleTime: 30 * 60 * 1000 });
  const { data: companySettings = [] } = useQuery({ queryKey: ['company-settings'], queryFn: () => db.CompanySettings.list(), staleTime: 30 * 60 * 1000 });
  const { data: commTemplates = [] } = useCommunicationTemplates();
  const { data: reminderLogs = [] } = useQuery({ queryKey: ['reminder-logs-delivery'], queryFn: () => db.ReminderLog.filter({ reminder_type: 'delivery' }), staleTime: 10 * 60 * 1000 });
  const { data: paymentMethods } = usePaymentMethodsQuery();
  const paymentMethodsList = paymentMethods ?? [];

  const sortedPaymentMethods = useMemo(
    () => activePaymentMethodsSorted(paymentMethodsList),
    [paymentMethodsList]
  );
  const defaultPmName = useMemo(() => pickDefaultPaymentMethod(paymentMethodsList), [paymentMethodsList]);

  const settingsRow = companySettings[0];
  const curCode = getCurrencyConfig(settingsRow).code;

  const displayedDeliveryReminderLogs = useMemo(() => {
    if (!deliveryReminderRecipientFilter) return reminderLogs;
    return reminderLogs.filter((l) => l.recipient_name === deliveryReminderRecipientFilter);
  }, [reminderLogs, deliveryReminderRecipientFilter]);

  const deliveryReminderRecipientOptions = useMemo(() => {
    const s = new Set();
    reminderLogs.forEach((l) => {
      if (l.recipient_name?.trim()) s.add(l.recipient_name);
    });
    return sortStringsForDisplay([...s]);
  }, [reminderLogs]);

  const salesDeliveryEmployees = useMemo(
    () => sortByLocaleKey(employees.filter((e) => e.role === "sales_delivery")),
    [employees]
  );
  /** Active PO ids — cancelled/deleted POs are excluded so their lines leave Vendor Orders. */
  const activeVendorPoIds = useMemo(
    () => new Set(vendorOrders.map((po) => String(po.id))),
    [vendorOrders]
  );

  const isPreReadyVendorStatus = (status) => {
    const s = (status || "pending").trim();
    return s === "pending" || s === "with_vendor";
  };

  /** PO issued and PO still exists; not yet ready for customer delivery. */
  const vendorOrderItems = useMemo(
    () =>
      billItems.filter((i) => {
        if (!i.vendor_id || !i.vendor_order_id) return false;
        if (!activeVendorPoIds.has(String(i.vendor_order_id))) return false;
        return isPreReadyVendorStatus(i.delivery_status);
      }),
    [billItems, activeVendorPoIds]
  );
  const readyItems = useMemo(
    () => billItems.filter((i) => i.vendor_id && i.delivery_status === "ready_for_delivery"),
    [billItems]
  );
  const deliveredUnpaid = useMemo(
    () => billItems.filter((i) => i.delivery_status === "delivered_unpaid"),
    [billItems]
  );

  const statusItems = useMemo(() => billItems.filter(i => i.vendor_id).filter(i => { const bill = bills.find(b => b.id === i.bill_id); const date = bill?.bill_date || ''; if (statusDateFrom && date < statusDateFrom) return false; if (statusDateTo && date > statusDateTo) return false; return true; }), [billItems, bills, statusDateFrom, statusDateTo]);

  const getBill = (billId) => bills.find(b => b.id === billId);
  const getVendorBillingForItem = (itemId) => vendorBillings.find(vb => vb.bill_item_id === itemId);

  const markReadyMutation = useMutation({
    mutationFn: async ({ ids }) => {
      const today = format(new Date(), "yyyy-MM-dd");
      const billingSnapshot = [...vendorBillings];
      let updated = 0;
      const billingWarnings = [];

      for (const id of ids) {
        const item = billItems.find((i) => String(i.id) === String(id));
        if (!item?.vendor_id) continue;

        await db.BillItem.update(id, { delivery_status: "ready_for_delivery" });
        updated += 1;

        const existing = billingSnapshot.find((vb) => String(vb.bill_item_id) === String(id));
        if (existing) continue;

        try {
          await db.VendorBilling.create({
            date: today,
            vendor_id: item.vendor_id,
            vendor_name: item.vendor_name || "",
            bill_item_id: id,
            bill_numbers: item.bill_number || "",
            amount: item.vendor_amount || 0,
            payment_method: "cash",
            entry_by: user?.full_name || user?.email || "",
            entry_timestamp: new Date().toISOString(),
            remarks: `${item.item_name} x${item.quantity} - Bill #${item.bill_number}`,
          });
        } catch (err) {
          billingWarnings.push(item.bill_number || id);
          console.warn("Vendor billing entry skipped for ready item:", id, err);
        }
      }

      if (!updated) {
        throw new Error("No items were updated. Select lines from Vendor Orders and try again.");
      }
      return { updated, billingWarnings };
    },
    onSuccess: async ({ updated, billingWarnings }) => {
      setSelectedIds([]);
      setTab("ready");
      await qc.invalidateQueries({ queryKey: ["bill-items-delivery"] });
      await qc.refetchQueries({ queryKey: ["bill-items-delivery"] });
      qc.invalidateQueries({ queryKey: ["vendor-billings"] });
      qc.invalidateQueries({ predicate: (q) => String(q.queryKey?.[0] || "").startsWith("bill-items") });
      const msg =
        updated === 1
          ? "1 item moved to Ready for Delivery"
          : `${updated} items moved to Ready for Delivery`;
      if (billingWarnings.length) {
        toast.success(msg, {
          description: "Some vendor billing rows could not be created; delivery status was still updated.",
        });
      } else {
        toast.success(msg);
      }
    },
    onError: (err) => {
      toast.error(err?.message || "Could not mark items as ready");
    },
  });

  const markNotReadyMutation = useMutation({
    mutationFn: async ({ ids, backStatus }) => {
      await Promise.all(ids.map(async id => {
        await db.BillItem.update(id, { delivery_status: backStatus || 'with_vendor' });
        const existing = getVendorBillingForItem(id);
        if (existing) await db.VendorBilling.delete(existing.id);
      }));
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['bill-items-delivery'] }); qc.invalidateQueries({ queryKey: ['vendor-billings'] }); setSelectedIds([]); toast.success("Reverted"); }
  });

  const markDeliveredMutation = useMutation({
    mutationFn: async ({ ids, deliveredBy, delivDate }) => {
      const billIds = new Set();
      await Promise.all(ids.map(async id => {
        const item = billItems.find(i => i.id === id);
        if (item?.bill_id) billIds.add(item.bill_id);
        await db.BillItem.update(id, { delivery_status: 'delivered_unpaid', delivered_by_name: deliveredBy, delivery_date: delivDate });
      }));
      await Promise.all(Array.from(billIds).map(billId => db.Bill.update(billId, { salesman_name: deliveredBy })));
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['bill-items-delivery'] }); qc.invalidateQueries({ queryKey: ['bills-delivery'] }); setSelectedIds([]); toast.success("Marked as Delivered"); }
  });

  const billItemSoftDelete = useSoftDelete({
    entityName: "BillItem",
    tableName: "bill_items",
    fallbackTableName: "bill_item",
    getDisplayName: (r) => `Bill #${r.bill_number || ""} — ${r.item_name || "line"}`,
    invalidateKeys: [["bill-items-delivery"], ["vendor-billings"], ["trash"]],
  });

  const confirmMoveBillItemsToTrash = () => {
    const ids = [...selectedIds];
    if (!ids.length) {
      setConfirmDelete(false);
      return;
    }
    const snapshot = [...billItems];
    const records = snapshot.filter((i) => ids.includes(i.id));
    const affectedBillIds = [...new Set(records.map((r) => r.bill_id).filter(Boolean))];
    const removedSet = new Set(ids);

    setItemTrashProgress({ open: true, current: 0, total: ids.length });
    (async () => {
      try {
        for (const id of ids) {
          const vb = vendorBillings.find((v) => v.bill_item_id === id);
          if (vb) await db.VendorBilling.delete(vb.id);
        }
        await billItemSoftDelete.mutateAsync({
          ids,
          records,
          onProgress: (cur, tot) => setItemTrashProgress({ open: true, current: cur, total: tot }),
        });
        for (const billId of affectedBillIds) {
          const bill = bills.find((b) => b.id === billId);
          if (!bill) continue;
          const remaining = snapshot.filter((i) => i.bill_id === billId && !removedSet.has(i.id));
          const total_qty = remaining.reduce((s, i) => s + (Number(i.quantity) || 0), 0);
          const total_amount = remaining.reduce((s, i) => s + (Number(i.amount) || 0), 0);
          const totalPaid = remaining.reduce((s, i) => s + (Number(i.payment_amount) || 0), 0);
          const { amount_paid: newAmountPaid, amount_due: newAmountDue, payment_status: paymentStatus } =
            computeBillCustomerBalance(total_amount, totalPaid);
          await db.Bill.update(billId, {
            total_qty,
            total_amount,
            amount_paid: newAmountPaid,
            amount_due: newAmountDue,
            payment_status: paymentStatus,
          });
        }
        qc.invalidateQueries({ queryKey: ["bills-delivery"] });
        invalidateAfterCustomerPaymentRecorded(qc);
        setSelectedIds([]);
        setConfirmDelete(false);
      } catch (e) {
        toast.error(e?.message || "Could not move items to Trash");
      } finally {
        setItemTrashProgress({ open: false, current: 0, total: 0 });
      }
    })();
  };

  const updateBillPaymentStatus = async (billId, updatedItemAmounts) => {
    const bill = getBill(billId);
    if (!bill) return;
    const allItems = billItems.filter(i => i.bill_id === billId);
    const totalPaid = allItems.reduce((s, i) => s + (updatedItemAmounts[i.id] !== undefined ? updatedItemAmounts[i.id] : (i.payment_amount || 0)), 0);
    const billTotal = bill.total_amount || 0;
    const { amount_paid: newAmountPaid, amount_due: newAmountDue, payment_status: paymentStatus } =
      computeBillCustomerBalance(billTotal, totalPaid);
    await db.Bill.update(bill.id, { amount_paid: newAmountPaid, amount_due: newAmountDue, payment_status: paymentStatus });
  };

  const recordPaymentMutation = useMutation({
    mutationFn: async (data) => {
      if (!data.amount || data.amount <= 0) throw new Error("Amount required");
      if (!data.date) throw new Error("Date required");
      if (!data.method) throw new Error("Payment method required");
      if (!data.collected_by_name) throw new Error("Collected By required");
      const item = billItems.find(i => i.id === data.itemId);
      if (!item) throw new Error("Line item not found");
      const bill = getBill(item.bill_id);
      const prev = {
        delivery_status: item.delivery_status,
        payment_amount: item.payment_amount,
        payment_method: item.payment_method,
        payment_collected_by_name: item.payment_collected_by_name,
        payment_date: item.payment_date,
      };
      let paymentId = null;
      try {
        const paymentRow = await db.PaymentCollection.create({
          date: data.date,
          customer_id: bill?.customer_id ?? null,
          customer_name: bill?.customer_name || "",
          bill_id: item.bill_id ?? null,
          bill_number: item.bill_number || "",
          method: data.method,
          amount: data.amount,
          collected_by_name: data.collected_by_name,
          recorded_by: user?.full_name || user?.email || "",
          salesman_name: getBillSalesmanDisplayName(bill),
        });
        paymentId = paymentRow?.id ?? null;
        const linePatch = buildDeliveredLineItemPaymentPatch(
          item,
          data.amount,
          data.date,
          data.method,
          data.collected_by_name
        );
        await db.BillItem.update(data.itemId, linePatch);
        if (bill) await updateBillPaymentStatus(bill.id, { [data.itemId]: linePatch.payment_amount });
      } catch (err) {
        if (paymentId) await db.PaymentCollection.delete(paymentId).catch(() => {});
        await db.BillItem.update(data.itemId, {
          delivery_status: prev.delivery_status,
          payment_amount: prev.payment_amount ?? null,
          payment_method: prev.payment_method ?? null,
          payment_collected_by_name: prev.payment_collected_by_name ?? null,
          payment_date: prev.payment_date ?? null,
        }).catch(() => {});
        throw err;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bill-items-delivery'] });
      invalidateAfterCustomerPaymentRecorded(qc);
      qc.invalidateQueries({ queryKey: ['bills-delivery'] });
      setPaymentDialog(null);
      toast.success("Payment recorded");
    },
    onError: (err) => {
      toast.error(err?.message || "Could not record payment");
    },
  });

  const bulkRecordPaymentMutation = useMutation({
    mutationFn: async (data) => {
      if (!data.date || !data.method || !data.collected_by_name) throw new Error("All fields required");
      const { items, method, collected_by_name, date, amounts } = data;
      const prevById = {};
      for (const it of items) {
        const cur = billItems.find((x) => x.id === it.id);
        if (cur) {
          prevById[it.id] = {
            delivery_status: cur.delivery_status,
            payment_amount: cur.payment_amount,
            payment_method: cur.payment_method,
            payment_collected_by_name: cur.payment_collected_by_name,
            payment_date: cur.payment_date,
          };
        }
      }
      const byBill = {};
      items.forEach((item) => {
        if (!byBill[item.bill_id]) byBill[item.bill_id] = { item, total: 0 };
        byBill[item.bill_id].total += amounts[item.id] || 0;
      });
      const createdPaymentIds = [];
      try {
        for (const [billId, { item, total }] of Object.entries(byBill)) {
          const bill = getBill(billId);
          const paymentRow = await db.PaymentCollection.create({
            date,
            customer_id: bill?.customer_id ?? null,
            customer_name: bill?.customer_name || "",
            bill_id: billId || null,
            bill_number: item.bill_number || "",
            method,
            amount: total,
            collected_by_name,
            recorded_by: user?.full_name || user?.email || "",
            salesman_name: getBillSalesmanDisplayName(bill),
          });
          if (paymentRow?.id) createdPaymentIds.push(paymentRow.id);
        }
        const linePatches = items.map((item) => {
          const amt = amounts[item.id] || 0;
          const patch = buildDeliveredLineItemPaymentPatch(item, amt, date, method, collected_by_name);
          return { id: item.id, patch };
        });
        await Promise.all(linePatches.map(({ id, patch }) => db.BillItem.update(id, patch)));
        const uniqueBillIds = [...new Set(items.map((i) => i.bill_id))];
        const updatedAmounts = Object.fromEntries(
          linePatches.map(({ id, patch }) => [id, patch.payment_amount])
        );
        await Promise.all(uniqueBillIds.map((billId) => updateBillPaymentStatus(billId, updatedAmounts)));
      } catch (err) {
        for (const id of createdPaymentIds) {
          await db.PaymentCollection.delete(id).catch(() => {});
        }
        await Promise.all(
          items.map((item) => {
            const p = prevById[item.id];
            if (!p) return Promise.resolve();
            return db.BillItem.update(item.id, {
              delivery_status: p.delivery_status,
              payment_amount: p.payment_amount ?? null,
              payment_method: p.payment_method ?? null,
              payment_collected_by_name: p.payment_collected_by_name ?? null,
              payment_date: p.payment_date ?? null,
            }).catch(() => {});
          })
        );
        throw err;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bill-items-delivery'] });
      invalidateAfterCustomerPaymentRecorded(qc);
      qc.invalidateQueries({ queryKey: ['bills-delivery'] });
      setBulkPaymentDialog(null);
      setSelectedIds([]);
      toast.success("Bulk payment recorded");
    },
    onError: (err) => {
      toast.error(err?.message || "Could not record bulk payment");
    },
  });

  const openBulkPaymentDialog = () => {
    const items = deliveredUnpaid.filter(i => selectedIds.includes(i.id));
    const amounts = {};
    items.forEach(i => { amounts[i.id] = i.amount || 0; });
    setBulkPaymentDialog({ items, amounts, method: defaultPmName, collected_by_name: '', date: format(new Date(), 'yyyy-MM-dd') });
  };

  const deleteLogsMutation = useMutation({
    mutationFn: (ids) => Promise.all(ids.map(id => db.ReminderLog.delete(id))),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['reminder-logs-delivery'] }); setSelectedLogIds([]); setConfirmDeleteLogs(false); toast.success("Logs deleted"); }
  });

  const sendVendorReminderMutation = useMutation({
    mutationFn: async (payload) => {
      const { selectedVendors, channels } = payload;
      const companyName = companySettings[0]?.company_name || 'COMFORT';
      let success = 0, failed = 0;

      for (const vendor of selectedVendors) {
        const vendorItems = vendorOrderItems.filter(i => i.vendor_id === vendor.id);
        const totalAmount = vendorItems.reduce((s, i) => s + (i.vendor_amount || 0), 0);
        const vars = buildJobReminderVars({
          vendor,
          billNumber: vendorItems[0]?.bill_number,
          items: vendorItems,
          companySettings: settingsRow,
        });
        const fallback = getDefaultEmailTemplate("job_reminder_vendor");
        const rendered = resolveRenderedMessage({
          templates: commTemplates,
          purpose: "job_reminder_vendor",
          channel: "email",
          vars,
          fallbackSubject: fallback.subject,
          fallbackBody: `Dear ${vendor.name},\n\nPending Items:\n${vars.items}\n\nTotal: ${vars.total_amount}\n\nBest Regards,\n${companyName}`,
        });

        if (channels.sendEmail && vendor.email) {
          try {
            await sendEmail({
              to: vendor.email,
              subject: rendered.subject || "Delivery Reminder — Pending Items",
              body: rendered.body,
              fromName: companySettings[0]?.email_from_name || companyName,
            });
            success++;
            await db.ReminderLog.create({
              reminder_type: 'delivery',
              recipient_name: vendor.name,
              recipient_email: vendor.email || '',
              recipient_phone: vendor.phone || '',
              channels: ['email'],
              related_bills: vendorItems.map(i => i.bill_number).join(', '),
              amount: totalAmount,
              sent_date: new Date().toISOString().slice(0, 10),
              sent_by: user?.full_name || user?.email || '',
              status: 'success',
            });
          } catch {
            failed++;
          }
        } else if (channels.sendEmail && !vendor.email) {
          failed++;
        }
      }
      return { success, failed };
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['reminder-logs-delivery'] });
      toast.success(`Email reminders: ${result.success} sent${result.failed > 0 ? `, ${result.failed} skipped (no email or failed)` : ''}`);
      setReminderModal(null);
    }
  });

  const buildVendorDeliveryReminderWhatsappBody = (rec) => {
    const vendor = rec.vendorData || vendors.find(v => v.id === rec.id);
    if (!vendor) return '';
    const companyName = companySettings[0]?.company_name || 'COMFORT';
    const vendorItems = vendorOrderItems.filter(i => i.vendor_id === vendor.id);
    const vars = buildJobReminderVars({
      vendor,
      billNumber: vendorItems[0]?.bill_number,
      items: vendorItems,
      companySettings: settingsRow,
    });
    const fallback = getDefaultEmailTemplate("job_reminder_vendor");
    return resolveRenderedMessage({
      templates: commTemplates,
      purpose: "job_reminder_vendor",
      channel: "whatsapp",
      vars,
      fallbackSubject: "",
      fallbackBody: fallback.body || `Dear ${vendor.name},\n\nPending Items:\n${vars.items}\n\nTotal: ${vars.total_amount}\n\nBest Regards,\n${companyName}`,
    }).body;
  };

  const openWhatsappVendorReminders = async (selectedRecipients, opts = {}) => {
    const sentDate = new Date().toISOString().slice(0, 10);
    const useSingleEditedBody = opts?.message != null && selectedRecipients.length === 1;
    let opened = 0;
    for (let i = 0; i < selectedRecipients.length; i++) {
      const rec = selectedRecipients[i];
      const vendor = rec.vendorData || vendors.find(v => v.id === rec.id);
      if (!vendor) continue;
      const vendorItems = vendorOrderItems.filter(i => i.vendor_id === vendor.id);
      const totalAmount = vendorItems.reduce((s, it) => s + (it.vendor_amount || 0), 0);
      const body = useSingleEditedBody ? opts.message : buildVendorDeliveryReminderWhatsappBody(rec);
      const url = buildWhatsappMeUrl(vendor.phone, body);
      if (url) {
        window.open(url, '_blank', 'noopener,noreferrer');
        opened++;
        await db.ReminderLog.create({
          reminder_type: 'delivery',
          recipient_name: vendor.name,
          recipient_email: vendor.email || '',
          recipient_phone: vendor.phone || '',
          channels: ['whatsapp'],
          related_bills: vendorItems.map(it => it.bill_number).join(', '),
          amount: totalAmount,
          sent_date: sentDate,
          sent_by: user?.full_name || user?.email || '',
          status: 'success',
        });
      }
      if (i < selectedRecipients.length - 1) await new Promise((r) => setTimeout(r, 450));
    }
    qc.invalidateQueries({ queryKey: ['reminder-logs-delivery'] });
    toast.success(opened > 0 ? `Opened WhatsApp for ${opened} vendor(s). Send each chat manually.` : 'WhatsApp opened.');
  };

  const openVendorReminderModal = () => {
    let vendorsWithPendingItems = [...new Set(vendorOrderItems.map(i => i.vendor_id))];
    if (vendorFilter) vendorsWithPendingItems = vendorsWithPendingItems.filter(id => vendors.find(v => v.id === id)?.name.toLowerCase().includes(vendorFilter.toLowerCase()));
    const recipients = vendorsWithPendingItems.map(vendorId => vendors.find(v => v.id === vendorId)).filter(Boolean).map(vendor => { const items = vendorOrderItems.filter(i => i.vendor_id === vendor.id); const totalAmount = items.reduce((s, i) => s + (i.vendor_amount || 0), 0); return { id: vendor.id, name: vendor.name, detail: `${items.length} items · ${formatCurrencyAmount(totalAmount, settingsRow)} pending`, vendorData: vendor }; });
    setReminderModal({ recipients, isVendor: true });
  };

  return (
    <div>
      <PageHeader title="Delivery Management" subtitle="Track items from vendor to customer delivery" permissionResource="delivery" />
      <Tabs value={tab} onValueChange={(t) => { setTab(t); setSelectedIds([]); }}>
        <TabsList className="mb-4 flex-wrap h-auto gap-1">
          <TabsTrigger value="vendor_orders" className="gap-1"><Package className="w-3.5 h-3.5" /> Vendor Orders ({vendorOrderItems.length})</TabsTrigger>
          <TabsTrigger value="ready" className="gap-1"><Truck className="w-3.5 h-3.5" /> Ready for Delivery ({readyItems.length})</TabsTrigger>
          <TabsTrigger value="delivered_unpaid" className="gap-1"><CreditCard className="w-3.5 h-3.5" /> Delivered - Unpaid ({deliveredUnpaid.length})</TabsTrigger>
          <TabsTrigger value="status" className="gap-1"><ListChecks className="w-3.5 h-3.5" /> Item by Status</TabsTrigger>
          <TabsTrigger value="reminder_log" className="gap-1"><Bell className="w-3.5 h-3.5" /> Reminder History</TabsTrigger>
        </TabsList>

        <TabsContent value="vendor_orders">
          <div className="mb-4 space-y-3">
            <div className="flex gap-2 items-end flex-wrap">
              <div className="flex-1"><Label className="text-xs">Filter by Vendor</Label><Input placeholder="Search vendor..." value={vendorFilter} onChange={e => setVendorFilter(e.target.value)} className="h-9" /></div>
              <Button size="sm" className="gap-1" onClick={openVendorReminderModal} disabled={vendorOrderItems.length === 0 || !canDeliveryReminderSend}><Bell className="w-4 h-4" /> Send Delivery Reminders</Button>
            </div>
            {selectedIds.length > 0 && (
              <div className="flex gap-2 flex-wrap items-center">
                {canDeliveryStatus && (
                  <Button size="sm" onClick={() => markReadyMutation.mutate({ ids: selectedIds })} disabled={markReadyMutation.isPending}>Mark Ready for Delivery ({selectedIds.length})</Button>
                )}
                {canDeleteDelivery && (
                  <Button size="sm" variant="outline" className="gap-1 text-destructive" onClick={() => setConfirmDelete(true)}>
                    <Trash2 className="w-3.5 h-3.5" /> Move to Trash ({selectedIds.length})
                  </Button>
                )}
              </div>
            )}
          </div>
          <DeliveryTable tableId="tbl-vendor-orders" title="Vendor Orders" items={vendorOrderItems} bills={bills} showVendor selectedIds={selectedIds} onSelectionChange={(canDeliveryStatus || canDeleteDelivery) ? setSelectedIds : undefined} useVendorAmount companySettings={companySettings[0] || {}}
            actions={(item) => (canDeliveryStatus ? <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => markReadyMutation.mutate({ ids: [item.id] })} disabled={markReadyMutation.isPending}>Mark Ready</Button> : null)}
          />
        </TabsContent>

        <TabsContent value="ready">
          {selectedIds.length > 0 && (
            <div className="flex gap-2 mb-3 items-end flex-wrap">
              {canDeliveryStatus && (
                <>
              <Select value={deliveryEmployee || '__none__'} onValueChange={(v) => setDeliveryEmployee(v === '__none__' ? '' : v)}><SelectTrigger className="w-40 h-9"><SelectValue placeholder="Delivery By" /></SelectTrigger><SelectContent><SelectItem value="__none__">Delivery By</SelectItem>{salesDeliveryEmployees.map(e => <SelectItem key={e.id} value={e.name}>{e.name}</SelectItem>)}</SelectContent></Select>
              <div><Label className="text-xs">Delivery Date</Label><Input type="date" className="h-9 w-36" value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)} /></div>
              <Button size="sm" onClick={() => { if (!deliveryEmployee) { toast.error("Select delivery employee"); return; } markDeliveredMutation.mutate({ ids: selectedIds, deliveredBy: deliveryEmployee, delivDate: deliveryDate }); }} disabled={markDeliveredMutation.isPending}>Mark Delivered ({selectedIds.length})</Button>
              <Button size="sm" variant="outline" onClick={() => markNotReadyMutation.mutate({ ids: selectedIds, backStatus: 'with_vendor' })} disabled={markNotReadyMutation.isPending}>Mark Not Ready ({selectedIds.length})</Button>
                </>
              )}
              {canDeleteDelivery && (
                <Button size="sm" variant="outline" className="gap-1 text-destructive" onClick={() => setConfirmDelete(true)}>
                  <Trash2 className="w-3.5 h-3.5" /> Move to Trash ({selectedIds.length})
                </Button>
              )}
            </div>
          )}
          <DeliveryTable tableId="tbl-ready" title="Ready for Delivery" items={readyItems} bills={bills} showVendor selectedIds={selectedIds} onSelectionChange={(canDeliveryStatus || canDeleteDelivery) ? setSelectedIds : undefined} useVendorAmount companySettings={companySettings[0] || {}}
            actions={(item) => {
              const empVal = rowDeliveryEmployee[item.id] || '';
              const dateVal = rowDeliveryDate[item.id] || format(new Date(), 'yyyy-MM-dd');
              if (!canDeliveryStatus) return null;
              return (
                <div className="flex gap-1 items-center">
                  <Select value={empVal || '__none__'} onValueChange={v => setRowDeliveryEmployee(prev => ({ ...prev, [item.id]: v === '__none__' ? '' : v }))}><SelectTrigger className="h-7 w-32 text-xs"><SelectValue placeholder="Delivery By" /></SelectTrigger><SelectContent><SelectItem value="__none__">Delivery By</SelectItem>{salesDeliveryEmployees.map(e => <SelectItem key={e.id} value={e.name}>{e.name}</SelectItem>)}</SelectContent></Select>
                  <Input type="date" className="h-7 w-28 text-xs" value={dateVal} onChange={e => setRowDeliveryDate(prev => ({ ...prev, [item.id]: e.target.value }))} />
                  <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => markNotReadyMutation.mutate({ ids: [item.id], backStatus: 'with_vendor' })} disabled={markNotReadyMutation.isPending}>Not Ready</Button>
                  <Button size="sm" className="text-xs h-7" onClick={() => { if (!empVal) { toast.error("Select delivery employee"); return; } markDeliveredMutation.mutate({ ids: [item.id], deliveredBy: empVal, delivDate: dateVal }); }} disabled={markDeliveredMutation.isPending}>Delivered</Button>
                </div>
              );
            }}
          />
        </TabsContent>

        <TabsContent value="delivered_unpaid">
          {selectedIds.length > 0 && (
            <div className="flex gap-2 mb-3 flex-wrap items-center">
              {canDeliveryStatus && (
                <Button size="sm" variant="outline" onClick={() => markNotReadyMutation.mutate({ ids: selectedIds, backStatus: 'ready_for_delivery' })} disabled={markNotReadyMutation.isPending}>Mark Not Delivered ({selectedIds.length})</Button>
              )}
              {canDeliveryCustomerPayment && (
                <Button size="sm" onClick={openBulkPaymentDialog}>Record Payment ({selectedIds.length})</Button>
              )}
              {canDeleteDelivery && (
                <Button size="sm" variant="outline" className="gap-1 text-destructive" onClick={() => setConfirmDelete(true)}>
                  <Trash2 className="w-3.5 h-3.5" /> Move to Trash ({selectedIds.length})
                </Button>
              )}
            </div>
          )}
          <DeliveryTable tableId="tbl-delivered-unpaid" title="Delivered - Unpaid" items={deliveredUnpaid} bills={bills} showDeliveredBy selectedIds={selectedIds} onSelectionChange={(canDeliveryStatus || canDeliveryCustomerPayment || canDeleteDelivery) ? setSelectedIds : undefined} useVendorAmount={false} companySettings={companySettings[0] || {}}
            actions={(item) => (
              <div className="flex gap-1">
                {canDeliveryStatus && (
                  <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => markNotReadyMutation.mutate({ ids: [item.id], backStatus: 'ready_for_delivery' })} disabled={markNotReadyMutation.isPending}>Not Delivered</Button>
                )}
                {canDeliveryCustomerPayment && (
                  <Button size="sm" className="text-xs h-7" onClick={() => setPaymentDialog({ itemId: item.id, amount: item.amount || 0, method: defaultPmName, collected_by_name: '', date: format(new Date(), 'yyyy-MM-dd') })}>Record Payment</Button>
                )}
              </div>
            )}
          />
        </TabsContent>

        <TabsContent value="status">
          {canDeleteDelivery && selectedIds.length > 0 && (
            <div className="flex gap-2 mb-3 flex-wrap items-center">
              <Button size="sm" variant="outline" className="gap-1 text-destructive" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="w-3.5 h-3.5" /> Move to Trash ({selectedIds.length})
              </Button>
            </div>
          )}
          <DeliveryTable tableId="tbl-item-status" title="Item by Status" items={statusItems} bills={bills} showVendor showStatus useVendorAmount={false} companySettings={companySettings[0] || {}}
            selectedIds={selectedIds}
            onSelectionChange={canDeleteDelivery ? setSelectedIds : undefined}
            dateRange={statusDateFrom || statusDateTo ? `${statusDateFrom || '...'} to ${statusDateTo || '...'}` : undefined}
            extraFilters={
              <div className="flex gap-2 items-center">
                <div className="flex items-center gap-1"><Label className="text-xs whitespace-nowrap">Bill Date From</Label><Input type="date" className="h-8 w-36 text-xs" value={statusDateFrom} onChange={e => setStatusDateFrom(e.target.value)} /></div>
                <div className="flex items-center gap-1"><Label className="text-xs whitespace-nowrap">To</Label><Input type="date" className="h-8 w-36 text-xs" value={statusDateTo} onChange={e => setStatusDateTo(e.target.value)} /></div>
                {(statusDateFrom || statusDateTo) && <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => { setStatusDateFrom(''); setStatusDateTo(''); }}>Clear</Button>}
              </div>
            }
          />
        </TabsContent>

        <TabsContent value="reminder_log">
          <div className="flex gap-3 mb-3 flex-wrap items-end">
            <div className="min-w-[200px]">
              <Label className="text-xs">Recipient</Label>
              <Select value={deliveryReminderRecipientFilter || '__all__'} onValueChange={v => setDeliveryReminderRecipientFilter(v === '__all__' ? '' : v)}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="All recipients" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All recipients</SelectItem>
                  {deliveryReminderRecipientOptions.map(name => <SelectItem key={name} value={name}>{name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          {canReminderLogDelete && selectedLogIds.length > 0 && <div className="mb-3"><Button size="sm" variant="destructive" className="gap-1" onClick={() => setConfirmDeleteLogs(true)}><Trash2 className="w-3.5 h-3.5" /> Delete ({selectedLogIds.length})</Button></div>}
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="bg-muted/50 border-b">
                {canReminderLogDelete && <th className="px-4 py-3 w-8"><Checkbox checked={selectedLogIds.length === displayedDeliveryReminderLogs.length && displayedDeliveryReminderLogs.length > 0} onCheckedChange={(checked) => setSelectedLogIds(checked ? displayedDeliveryReminderLogs.map(l => l.id) : [])} /></th>}
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Date</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Recipient</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Channels</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Bills</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground">Amount</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Status</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Sent By</th>
              </tr></thead>
              <tbody>
                {reminderLogs.length === 0 ? <tr><td colSpan={canReminderLogDelete ? 8 : 7} className="px-4 py-8 text-center text-muted-foreground text-sm">No vendor reminders sent yet</td></tr> : displayedDeliveryReminderLogs.length === 0 ? <tr><td colSpan={canReminderLogDelete ? 8 : 7} className="px-4 py-8 text-center text-muted-foreground text-sm">No rows for this recipient</td></tr> : displayedDeliveryReminderLogs.map(log => (
                  <tr key={log.id} className="border-b last:border-0 hover:bg-muted/30">
                    {canReminderLogDelete && <td className="px-4 py-3"><Checkbox checked={selectedLogIds.includes(log.id)} onCheckedChange={(checked) => setSelectedLogIds(prev => checked ? [...prev, log.id] : prev.filter(id => id !== log.id))} /></td>}
                    <td className="px-4 py-3 text-sm">{log.sent_date}</td>
                    <td className="px-4 py-3 text-sm font-medium">{log.recipient_name}</td>
                    <td className="px-4 py-3 text-sm">{log.channels?.join(', ') || '-'}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{log.related_bills}</td>
                    <td className="px-4 py-3 text-sm text-right font-medium">{formatCurrencyAmount(log.amount || 0, settingsRow)}</td>
                    <td className="px-4 py-3"><StatusBadge status={log.status} /></td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{log.sent_by}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={!!paymentDialog} onOpenChange={(open) => { if (!open) setPaymentDialog(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Record Payment</DialogTitle></DialogHeader>
          {paymentDialog && (
            <>
              <div className="grid gap-4 py-2">
                <div><Label>Amount ({curCode})</Label><Input type="number" value={paymentDialog.amount} onChange={e => setPaymentDialog({ ...paymentDialog, amount: Number(e.target.value) })} /></div>
                <div><Label>Date</Label><Input type="date" value={paymentDialog.date} onChange={e => setPaymentDialog({ ...paymentDialog, date: e.target.value })} /></div>
                <div><Label>Payment method *</Label><Select value={paymentMethodSelectValue(paymentDialog.method, sortedPaymentMethods, defaultPmName)} onValueChange={v => setPaymentDialog({ ...paymentDialog, method: v })}><SelectTrigger><SelectValue placeholder="Select method" /></SelectTrigger><SelectContent>{sortedPaymentMethods.map(m => <SelectItem key={m.id} value={m.name}>{m.name}</SelectItem>)}</SelectContent></Select></div>
                <div>
                  <Label>Collected By *</Label>
                  <Input
                    className="h-9"
                    list="delivery-collected-by-datalist"
                    placeholder="Pick from suggestions or type a name"
                    value={paymentDialog.collected_by_name}
                    onChange={(e) => setPaymentDialog({ ...paymentDialog, collected_by_name: e.target.value })}
                  />
                  <datalist id="delivery-collected-by-datalist">
                    {salesDeliveryEmployees.map((e) => (
                      <option key={e.id} value={e.name} />
                    ))}
                  </datalist>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setPaymentDialog(null)}>Cancel</Button>
                <Button onClick={() => recordPaymentMutation.mutate(paymentDialog)} disabled={recordPaymentMutation.isPending || !canDeliveryCustomerPayment || !paymentDialog.amount || paymentDialog.amount <= 0 || !String(paymentDialog.method || '').trim() || !String(paymentDialog.collected_by_name || '').trim()}>Save Payment</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {bulkPaymentDialog && (
        <Dialog open onOpenChange={() => setBulkPaymentDialog(null)}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Record Bulk Payment - {bulkPaymentDialog.items.length} items</DialogTitle></DialogHeader>
            <div className="space-y-4 py-2">
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead><tr className="bg-muted/50 border-b text-xs text-muted-foreground"><th className="text-left px-3 py-2">Bill #</th><th className="text-left px-3 py-2">Customer</th><th className="text-left px-3 py-2">Item</th><th className="text-right px-3 py-2">Qty</th><th className="text-right px-3 py-2 w-32">Amount ({curCode})</th></tr></thead>
                  <tbody>
                    {bulkPaymentDialog.items.map(item => (
                      <tr key={item.id} className="border-b last:border-0">
                        <td className="px-3 py-2 font-medium">{item.bill_number}</td>
                        <td className="px-3 py-2 text-muted-foreground">{getBill(item.bill_id)?.customer_name || '-'}</td>
                        <td className="px-3 py-2">{item.item_name}</td>
                        <td className="px-3 py-2 text-right">{item.quantity}</td>
                        <td className="px-3 py-2"><Input type="number" className="h-7 text-xs text-right w-28" value={bulkPaymentDialog.amounts[item.id] || 0} onChange={e => setBulkPaymentDialog(prev => ({ ...prev, amounts: { ...prev.amounts, [item.id]: Number(e.target.value) } }))} /></td>
                      </tr>
                    ))}
                    <tr className="bg-primary/5 font-semibold border-t-2"><td colSpan={4} className="px-3 py-2.5 text-right text-sm">Total</td><td className="px-3 py-2.5 text-right text-sm">{formatCurrencyAmount(Object.values(bulkPaymentDialog.amounts).reduce((s, v) => s + (v || 0), 0), settingsRow)}</td></tr>
                  </tbody>
                </table>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div><Label>Date</Label><Input type="date" value={bulkPaymentDialog.date} onChange={e => setBulkPaymentDialog(prev => ({ ...prev, date: e.target.value }))} /></div>
                <div><Label>Payment method *</Label><Select value={paymentMethodSelectValue(bulkPaymentDialog.method, sortedPaymentMethods, defaultPmName)} onValueChange={v => setBulkPaymentDialog(prev => ({ ...prev, method: v }))}><SelectTrigger><SelectValue placeholder="Select method" /></SelectTrigger><SelectContent>{sortedPaymentMethods.map(m => <SelectItem key={m.id} value={m.name}>{m.name}</SelectItem>)}</SelectContent></Select></div>
                <div>
                  <Label>Collected By *</Label>
                  <Input
                    className="h-9"
                    list="delivery-bulk-collected-by-datalist"
                    placeholder="Pick from suggestions or type a name"
                    value={bulkPaymentDialog.collected_by_name}
                    onChange={(e) => setBulkPaymentDialog((prev) => ({ ...prev, collected_by_name: e.target.value }))}
                  />
                  <datalist id="delivery-bulk-collected-by-datalist">
                    {salesDeliveryEmployees.map((e) => (
                      <option key={e.id} value={e.name} />
                    ))}
                  </datalist>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setBulkPaymentDialog(null)}>Cancel</Button>
              <Button onClick={() => bulkRecordPaymentMutation.mutate(bulkPaymentDialog)} disabled={!String(bulkPaymentDialog.method || '').trim() || !bulkPaymentDialog.collected_by_name?.trim() || !Object.values(bulkPaymentDialog.amounts).some(v => v > 0) || bulkRecordPaymentMutation.isPending || !canDeliveryCustomerPayment}>Save Payment</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      <ConfirmModal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={confirmMoveBillItemsToTrash}
        title="Move line items to Trash?"
        description={`Move ${selectedIds.length} delivery line item(s) to Trash? Linked vendor billing rows for those lines are removed. Parent bill totals are updated. Restore from Administration → Trash Bin.`}
        confirmText="Move to Trash"
        destructive
      />
      <ProgressModal open={itemTrashProgress.open} current={itemTrashProgress.current} total={itemTrashProgress.total} title="Moving to Trash…" />
      <ConfirmModal open={confirmDeleteLogs} onClose={() => setConfirmDeleteLogs(false)} onConfirm={() => deleteLogsMutation.mutate(selectedLogIds)} title="Delete Reminder Logs" description={`Permanently delete ${selectedLogIds.length} log record(s)?`} confirmText="Delete" destructive />

      <ReminderModal
        open={!!reminderModal && reminderModal.isVendor}
        onClose={() => setReminderModal(null)}
        title="Send Delivery Reminders to Vendors"
        recipients={reminderModal?.recipients || []}
        onSend={async (selectedRecipients, channels) => {
          const selectedVendors = selectedRecipients.map(r => vendors.find(v => v.id === r.id)).filter(Boolean);
          if (selectedVendors.length > 0) await sendVendorReminderMutation.mutateAsync({ selectedVendors, channels });
        }}
        onOpenWhatsApp={openWhatsappVendorReminders}
        getWhatsAppDraft={(selected) => buildVendorDeliveryReminderWhatsappBody(selected[0])}
        getRecipientPhone={(r) => r.vendorData?.phone}
        getRecipientEmail={(r) => r.vendorData?.email}
        loading={sendVendorReminderMutation.isPending}
        previewEmail={(recipient) => {
          const vendor = vendors.find(v => v.id === recipient.id);
          const vendorItems = vendorOrderItems.filter(i => i.vendor_id === recipient.id);
          const totalAmount = vendorItems.reduce((s, i) => s + (i.vendor_amount || 0), 0);
          const itemList = vendorItems.map(i => `- Bill #${i.bill_number}: ${i.item_name} x${i.quantity} - ${formatCurrencyAmount(i.vendor_amount || 0, settingsRow)}`).join('\n');
          return { subject: 'Delivery Reminder - Pending Items', body: `Dear ${recipient.name},\n\nPending Items:\n${itemList}\n\nTotal: ${formatCurrencyAmount(totalAmount, settingsRow)}\n\nBest Regards,\n${companySettings[0]?.company_name || 'COMFORT'}`, recipient: { name: recipient.name, email: vendor?.email || '' } };
        }}
      />
    </div>
  );
}