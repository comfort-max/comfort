import React, { useState, useMemo } from "react";
import { db } from "@/services/SupabaseService";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import PageHeader from "@/components/shared/PageHeader";
import DataTable from "@/components/shared/DataTable";
import StatusBadge from "@/components/shared/StatusBadge";
import ConfirmModal from "@/components/shared/ConfirmModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, ChevronDown, Eye, Mail, MessageSquare } from "lucide-react";
import BillNotificationDialog from "@/components/shared/BillNotificationDialog";
import { toast } from "sonner";
import { format, subMonths } from "date-fns";
import FileUploadButton from "@/components/shared/FileUploadButton";
import { useAuth } from "@/lib/AuthContext";
import { formatPeriodForExport, normalizeFinancialYearRule } from "@/lib/financialYear";
import { formatCurrencyAmount } from "@/lib/currency";
import { invalidateAfterCustomerPaymentRecorded } from "@/lib/invalidatePaymentCaches";
import { archiveBillsToTrash } from "@/lib/billTrash";
import { orderedDisplayCategories } from "@/lib/rateListImportExport";
import { sortByLocaleKey } from "@/lib/utils";
import { usePermissions } from "@/hooks/usePermissions";

/**
 * Next bill # in series from existing rows: prefers whole numeric strings, else max trailing digits.
 * Padding width follows the longest digit run that set the max (and fits max+1).
 */
function computeNextBillNumber(bills) {
  let maxNum = 0;
  let digitWidth = 1;
  for (const b of bills || []) {
    const s = String(b?.bill_number ?? "").trim();
    if (!s) continue;
    if (/^\d+$/.test(s)) {
      const n = parseInt(s, 10);
      if (!Number.isNaN(n)) {
        if (n > maxNum) maxNum = n;
        digitWidth = Math.max(digitWidth, s.length);
      }
      continue;
    }
    const m = s.match(/(\d+)$/);
    if (m) {
      const digits = m[1];
      const n = parseInt(digits, 10);
      if (!Number.isNaN(n)) {
        if (n > maxNum) maxNum = n;
        digitWidth = Math.max(digitWidth, digits.length);
      }
    }
  }
  const next = maxNum + 1;
  digitWidth = Math.max(digitWidth, String(next).length);
  if (maxNum === 0 && (!bills || !bills.some((x) => String(x?.bill_number ?? "").trim()))) {
    return "001";
  }
  if (maxNum === 0) {
    return String(next).padStart(Math.max(3, digitWidth), "0");
  }
  return String(next).padStart(digitWidth, "0");
}

export default function Bills() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { can } = usePermissions();
  const canDeleteBills = can("bills", "delete");
  const canEditBills = can("bills", "edit");
  const canExportBills = can("bills", "export");
  const canUploadBills = can("bills", "upload");
  const canNotifyCustomer = can("bills", "bill_notify_send");
  const [showForm, setShowForm] = useState(false);
  const [notifyContext, setNotifyContext] = useState(null);
  const [editingBill, setEditingBill] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [expandedBill, setExpandedBill] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null);

  const today = format(new Date(), 'yyyy-MM-dd');
  const threeMonthsAgo = format(subMonths(new Date(), 3), 'yyyy-MM-dd');
  const [dateFrom, setDateFrom] = useState(threeMonthsAgo);
  const [dateTo, setDateTo] = useState(today);

  const [form, setForm] = useState({ bill_number: '', bill_date: format(new Date(), 'yyyy-MM-dd'), customer_id: '', customer_name: '', pickup_date: '', pickup_employee_id: '', pickup_employee_name: '', expected_delivery_date: '', delivered_by_id: '', delivered_by_name: '', receipt_url: '', remarks: '', items: [] });

  /** Higher limit so suggested bill # and duplicate checks reflect recent series, not only latest 500 by date */
  const { data: bills = [], isLoading } = useQuery({
    queryKey: ["bills-delivery"],
    queryFn: () => db.Bill.list("-created_date", 5000),
    staleTime: 10 * 60 * 1000,
  });
  const { data: customers = [] } = useQuery({
    queryKey: ['customers-active'],
    queryFn: async () => {
      const allCustomers = await db.Customer.list('-created_date', 2000);
      return allCustomers.filter((c) => !c.status || c.status === 'active');
    },
    staleTime: 20 * 60 * 1000
  });
  const { data: employees = [] } = useQuery({ queryKey: ['employees-active'], queryFn: () => db.Employee.filter({ status: 'active' }), staleTime: 20 * 60 * 1000 });
  const { data: rateList = [] } = useQuery({ queryKey: ['rate-list'], queryFn: () => db.RateListItem.list('category', 500), staleTime: 30 * 60 * 1000 });
  const { data: billItems = [] } = useQuery({ queryKey: ['bill-items'], queryFn: () => db.BillItem.list('-created_date', 2000), staleTime: 10 * 60 * 1000 });
  const { data: companySettings = [] } = useQuery({ queryKey: ['company-settings'], queryFn: () => db.CompanySettings.list(), staleTime: 30 * 60 * 1000 });

  const fyRule = useMemo(() => normalizeFinancialYearRule(companySettings[0]), [companySettings]);
  const billRateListCategories = useMemo(() => orderedDisplayCategories(rateList), [rateList]);

  const salesDeliveryEmployees = useMemo(() => employees.filter((e) => e.role === "sales_delivery"), [employees]);
  /** Radix Select + empty string breaks controlled mode; use full employee list if no role match */
  const pickupEmployeeChoices = useMemo(() => {
    const list = salesDeliveryEmployees.length > 0 ? salesDeliveryEmployees : employees;
    return sortByLocaleKey(list);
  }, [salesDeliveryEmployees, employees]);
  const customersSorted = useMemo(() => sortByLocaleKey(customers), [customers]);

  const filteredBills = useMemo(() => bills.filter(b => b.bill_date >= dateFrom && b.bill_date <= dateTo), [bills, dateFrom, dateTo]);

  const suggestedNextBillNumber = useMemo(() => computeNextBillNumber(bills), [bills]);

  const billNumberConflict = useMemo(() => {
    const n = String(form.bill_number ?? "").trim();
    if (!n) return false;
    return bills.some(
      (b) => String(b.bill_number ?? "").trim() === n && (!editingBill || b.id !== editingBill.id)
    );
  }, [form.bill_number, bills, editingBill]);

  /** Postgres date/timestamptz columns reject ""; use null for optional fields */
  const normalizeBillPayload = (payload) => {
    const p = { ...payload };
    const dateKeys = ['bill_date', 'pickup_date', 'expected_delivery_date'];
    for (const key of dateKeys) {
      if (p[key] === '' || p[key] === undefined) p[key] = null;
    }
    const uuidKeys = ['customer_id', 'pickup_employee_id', 'salesman_id'];
    for (const key of uuidKeys) {
      if (p[key] === '') p[key] = null;
    }
    return p;
  };

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      const { items, ...billData } = data;
      billData.entry_by = user?.full_name || user?.email || '';
      billData.entry_timestamp = new Date().toISOString();
      billData.salesman_id = billData.delivered_by_id || null;
      billData.salesman_name = billData.delivered_by_name || '';
      delete billData.delivered_by_id;
      delete billData.delivered_by_name;
      billData.total_qty = items.reduce((s, i) => s + (i.quantity || 0), 0);
      billData.total_amount = items.reduce((s, i) => s + (i.amount || 0), 0);
      billData.amount_due = billData.total_amount;
      billData.amount_paid = 0;
      billData.payment_status = 'pending';

      const normalized = normalizeBillPayload(billData);
      const bn = String(normalized.bill_number ?? "").trim();
      if (!bn) throw new Error("Bill number is required");
      const list = qc.getQueryData(["bills-delivery"]) || [];
      if (
        list.some(
          (b) => String(b.bill_number ?? "").trim() === bn && (!editingBill || b.id !== editingBill.id)
        )
      ) {
        throw new Error(`Bill number "${bn}" already exists. Choose a different number.`);
      }

      const isCreate = !editingBill;
      let bill;
      if (editingBill) {
        bill = await db.Bill.update(editingBill.id, normalized);
        const existing = billItems.filter(bi => bi.bill_id === editingBill.id);
        await Promise.all(existing.map(i => db.BillItem.delete(i.id)));
      } else {
        bill = await db.Bill.create(normalized);
      }
      const billId = bill.id || editingBill?.id;
      if (items.length > 0) {
        await db.BillItem.bulkCreate(
          items.map((i) => ({
            ...i,
            bill_id: billId,
            bill_number: normalized.bill_number,
            delivery_status: i.delivery_status || "pending",
          }))
        );
      }
      return { bill: { ...bill, ...normalized, id: billId }, items, isCreate };
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['bills-delivery'] });
      qc.invalidateQueries({ queryKey: ['bill-items'] });
      qc.invalidateQueries({ queryKey: ['bill-items-vj'] });
      qc.invalidateQueries({ queryKey: ['bills-vj'] });
      qc.invalidateQueries({ queryKey: ['bill-items-vo'] });
      qc.invalidateQueries({ queryKey: ['bill-items-delivery'] });
      setShowForm(false);
      const wasCreate = result?.isCreate;
      toast.success(wasCreate ? "Bill created" : "Bill updated");
      setEditingBill(null);
      if (wasCreate && canNotifyCustomer && result?.bill) {
        const customer = customers.find((c) => c.id === result.bill.customer_id);
        setNotifyContext({
          bill: result.bill,
          items: result.items || [],
          customer,
          initialChannel: "email",
        });
      }
    },
    onError: (err) => {
      toast.error(err?.message || "Could not save bill");
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (ids) => {
      await archiveBillsToTrash(ids, bills, billItems);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bills-delivery'] });
      qc.invalidateQueries({ queryKey: ['bill-items'] });
      invalidateAfterCustomerPaymentRecorded(qc);
      qc.invalidateQueries({ queryKey: ['vendor-billings'] });
      qc.invalidateQueries({ queryKey: ['expenses-all'] });
      qc.invalidateQueries({ queryKey: ['trash'] });
      setSelectedIds([]);
      toast.success("Bill(s) moved to Trash. Restore them from Administration → Trash Bin if needed.");
    },
    onError: (err) => {
      toast.error(err?.message || "Could not move bills to Trash");
    },
  });

  const addItem = () => setForm(f => ({ ...f, items: [...f.items, { item_name: '', category: '', quantity: 1, rate: 0, amount: 0 }] }));
  const updateItem = (idx, field, value) => {
    setForm(f => {
      const items = [...f.items];
      items[idx] = { ...items[idx], [field]: value };
      if (field === 'item_name') { const rateItem = rateList.find(r => r.item_name === value); if (rateItem) { items[idx].rate = rateItem.price; items[idx].category = rateItem.category; items[idx].amount = items[idx].quantity * rateItem.price; } }
      if (field === 'quantity' || field === 'rate') { items[idx].amount = (items[idx].quantity || 0) * (items[idx].rate || 0); }
      return { ...f, items };
    });
  };
  const removeItem = (idx) => setForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));
  const selectCustomer = (id) => { const c = customers.find(c => c.id === id); setForm(f => ({ ...f, customer_id: id, customer_name: c?.name || '' })); };
  const selectEmployee = (field, id) => { const e = employees.find(e => e.id === id); if (field === 'pickup') setForm(f => ({ ...f, pickup_employee_id: id, pickup_employee_name: e?.name || '' })); if (field === 'delivered_by') setForm(f => ({ ...f, delivered_by_id: id, delivered_by_name: e?.name || '' })); };

  const handleEdit = (bill) => {
    const items = billItems.filter(bi => bi.bill_id === bill.id).map(i => ({ item_name: i.item_name, category: i.category, quantity: i.quantity, rate: i.rate, amount: i.amount }));
    setForm({ bill_number: bill.bill_number || '', bill_date: bill.bill_date || format(new Date(), 'yyyy-MM-dd'), customer_id: bill.customer_id || '', customer_name: bill.customer_name || '', pickup_date: bill.pickup_date || '', pickup_employee_id: bill.pickup_employee_id || '', pickup_employee_name: bill.pickup_employee_name || '', expected_delivery_date: bill.expected_delivery_date || '', delivered_by_id: bill.salesman_id || '', delivered_by_name: bill.salesman_name || '', receipt_url: bill.receipt_url || '', remarks: bill.remarks || '', items });
    setEditingBill(bill); setShowForm(true);
  };

  const getItemsForBill = (billId) => billItems.filter(i => i.bill_id === billId);

  const openBillNotify = (bill, channel = "email") => {
    const customer = customers.find((c) => c.id === bill.customer_id);
    setNotifyContext({
      bill,
      items: getItemsForBill(bill.id).map((i) => ({
        item_name: i.item_name,
        category: i.category,
        quantity: i.quantity,
        rate: i.rate,
        amount: i.amount,
      })),
      customer,
      initialChannel: channel,
    });
  };

  const columns = useMemo(
    () => [
    { key: 'bill_number', header: 'Bill #', accessor: 'bill_number', sortable: true },
    { key: 'bill_date', header: 'Date', accessor: 'bill_date', sortable: true },
    { key: 'customer', header: 'Customer', accessor: 'customer_name', sortable: true },
    { key: 'pickup_by', header: 'Pickup By', accessor: r => r.pickup_employee_name || '-' },
    { key: 'delivered_by', header: 'Delivered By', accessor: 'salesman_name' },
    { key: 'qty', header: 'Qty', accessor: 'total_qty', sortable: true },
    { key: 'amount', header: 'Amount', accessor: 'total_amount', sortable: true, render: (r) => formatCurrencyAmount(r.total_amount || 0, companySettings[0]) },
    { key: 'due', header: 'Due', accessor: 'amount_due', sortable: true, render: (r) => <span className={r.amount_due > 0 ? 'text-amber-600 font-medium' : r.amount_due < 0 ? 'text-sky-700 font-medium' : 'text-emerald-600'}>{formatCurrencyAmount(r.amount_due || 0, companySettings[0])}</span> },
    { key: 'payment_status', header: 'Payment', render: (r) => <StatusBadge status={r.payment_status} /> },
    { key: 'entry_by', header: 'Entry By', accessor: 'entry_by' },
    { key: 'actions', header: '', render: (r) => (
      <div className="flex gap-1">
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); setExpandedBill(expandedBill === r.id ? null : r.id); }}>
          {expandedBill === r.id ? <ChevronDown className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
        </Button>
        {canNotifyCustomer && (
          <>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-blue-600" title="Email customer" onClick={(e) => { e.stopPropagation(); openBillNotify(r, "email"); }}><Mail className="w-3.5 h-3.5" /></Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-green-600" title="WhatsApp customer" onClick={(e) => { e.stopPropagation(); openBillNotify(r, "whatsapp"); }}><MessageSquare className="w-3.5 h-3.5" /></Button>
          </>
        )}
        {canEditBills && (
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); handleEdit(r); }}><Pencil className="w-3.5 h-3.5" /></Button>
        )}
      </div>
    )}
  ],
    [companySettings, expandedBill, canEditBills, canNotifyCustomer, customers, billItems]
  );

  const expandedBillRow = expandedBill ? filteredBills.find((b) => b.id === expandedBill) : null;

  return (
    <div>
      <PageHeader permissionResource="bills" title="Bills / Orders" subtitle="Manage customer bills and orders" exportData={filteredBills.map(b => ({ Bill: b.bill_number, Date: b.bill_date, Customer: b.customer_name, 'Pickup By': b.pickup_employee_name || '', 'Delivered By': b.salesman_name || '', Qty: b.total_qty || 0, Amount: b.total_amount || 0, Paid: b.amount_paid || 0, Due: b.amount_due || 0, 'Payment Status': b.payment_status, 'Entry By': b.entry_by || '' }))} dateRange={formatPeriodForExport(dateFrom, dateTo, fyRule)}>
        {canDeleteBills && selectedIds.length > 0 && <Button variant="outline" size="sm" className="gap-1 text-destructive" onClick={() => setConfirmAction({ ids: selectedIds })}><Trash2 className="w-3.5 h-3.5" /> Move to Trash ({selectedIds.length})</Button>}
        {canEditBills && <Button size="sm" className="gap-1" onClick={() => { setForm({ bill_number: suggestedNextBillNumber, bill_date: format(new Date(), 'yyyy-MM-dd'), customer_id: '', customer_name: '', pickup_date: '', pickup_employee_id: '', pickup_employee_name: '', expected_delivery_date: '', delivered_by_id: '', delivered_by_name: '', receipt_url: '', remarks: '', items: [] }); setEditingBill(null); setShowForm(true); }}><Plus className="w-4 h-4" /> New Bill</Button>}
      </PageHeader>

      <div className="mb-6 flex gap-4 items-end bg-card p-4 rounded-lg border">
        <div><Label className="text-xs text-muted-foreground">From</Label><Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-9 text-sm w-40" /></div>
        <div><Label className="text-xs text-muted-foreground">To</Label><Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="h-9 text-sm w-40" /></div>
        <div className="text-xs text-muted-foreground">Showing {filteredBills.length} bill(s)</div>
      </div>

      <DataTable columns={columns} data={filteredBills} loading={isLoading} selectable={canDeleteBills} selectedIds={selectedIds} onSelectionChange={setSelectedIds} searchPlaceholder="Search bills..." />

      {expandedBill && (
        <div className="mt-2 p-4 bg-muted/30 rounded-lg border">
          <React.Fragment>
            <h4 className="text-sm font-semibold mb-2">Items in Bill</h4>
            {canNotifyCustomer && expandedBillRow ? (
              <div className="flex gap-2 mb-2 justify-end">
                <Button size="sm" variant="outline" className="gap-1 h-8" onClick={() => openBillNotify(expandedBillRow, "email")}><Mail className="w-3.5 h-3.5" /> Email</Button>
                <Button size="sm" variant="outline" className="gap-1 h-8 text-green-700 border-green-300" onClick={() => openBillNotify(expandedBillRow, "whatsapp")}><MessageSquare className="w-3.5 h-3.5" /> WhatsApp</Button>
              </div>
            ) : null}
          </React.Fragment>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b text-xs text-muted-foreground"><th className="text-left py-1">Item</th><th className="text-left py-1">Category</th><th className="text-right py-1">Qty</th><th className="text-right py-1">Rate</th><th className="text-right py-1">Amount</th><th className="text-left py-1">Vendor</th><th className="text-left py-1">Status</th></tr></thead>
              <tbody>
                {getItemsForBill(expandedBill).map(item => (
                  <tr key={item.id} className="border-b last:border-0">
                    <td className="py-1.5">{item.item_name}</td><td className="py-1.5 text-muted-foreground">{item.category}</td><td className="py-1.5 text-right">{item.quantity}</td><td className="py-1.5 text-right">{formatCurrencyAmount(item.rate, companySettings[0])}</td><td className="py-1.5 text-right font-medium">{formatCurrencyAmount(item.amount, companySettings[0])}</td><td className="py-1.5">{item.vendor_name || '-'}</td><td className="py-1.5"><StatusBadge status={item.delivery_status} /></td>
                  </tr>
                ))}
                {getItemsForBill(expandedBill).length === 0 && <tr><td colSpan={7} className="text-center py-4 text-muted-foreground">No items</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingBill ? "Edit" : "New"} Bill</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="sm:col-span-1">
                <div className="flex items-center justify-between gap-2">
                  <Label>Bill Number *</Label>
                  {!editingBill && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs shrink-0 px-2"
                      onClick={() => setForm((f) => ({ ...f, bill_number: suggestedNextBillNumber }))}
                    >
                      Use next #
                    </Button>
                  )}
                </div>
                <Input
                  value={form.bill_number}
                  onChange={(e) => setForm({ ...form, bill_number: e.target.value })}
                  placeholder="e.g. 5890"
                  className={billNumberConflict ? "border-destructive focus-visible:ring-destructive" : undefined}
                  aria-invalid={billNumberConflict}
                />
                {!editingBill && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Suggested next in series: <span className="font-medium text-foreground">{suggestedNextBillNumber}</span>
                    {" "}(you can change it; duplicates are blocked).
                  </p>
                )}
                {billNumberConflict && (
                  <p className="text-xs text-destructive mt-1">This bill number is already used. Pick another.</p>
                )}
              </div>
              <div><Label>Bill Date *</Label><Input type="date" value={form.bill_date} onChange={e => setForm({ ...form, bill_date: e.target.value })} /></div>
              <div><Label>Pickup Date *</Label><Input type="date" value={form.pickup_date} onChange={e => setForm({ ...form, pickup_date: e.target.value })} /></div>
              <div><Label>Expected Delivery</Label><Input type="date" value={form.expected_delivery_date} onChange={e => setForm({ ...form, expected_delivery_date: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div><Label>Customer *</Label><Select value={form.customer_id || undefined} onValueChange={selectCustomer}><SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger><SelectContent>{customersSorted.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select></div>
              <div><Label>Pickup By / Salesman *</Label><Select value={form.pickup_employee_id || undefined} onValueChange={id => selectEmployee('pickup', id)}><SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger><SelectContent>{pickupEmployeeChoices.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}</SelectContent></Select></div>
              <div><Label>Delivered By</Label><Select value={form.delivered_by_id || undefined} onValueChange={id => selectEmployee('delivered_by', id)}><SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger><SelectContent>{pickupEmployeeChoices.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}</SelectContent></Select></div>
            </div>
            <div>
              <div className="flex justify-between items-center mb-2">
                <Label className="text-sm font-semibold">Items</Label>
                <Button type="button" variant="outline" size="sm" onClick={addItem} disabled={!canEditBills}><Plus className="w-3.5 h-3.5 mr-1" /> Add Item</Button>
              </div>
              <div className="space-y-2">
                {form.items.map((item, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-end p-2 bg-muted/30 rounded-lg">
                    <div className="col-span-4">
                      <Select value={item.item_name || undefined} onValueChange={v => updateItem(idx, 'item_name', v)}>
                        <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Select item" /></SelectTrigger>
                        <SelectContent>
                          {billRateListCategories.map((cat) => (
                            <React.Fragment key={cat}>
                              <SelectItem value={`__header_${cat}`} disabled className="font-bold text-xs">{cat}</SelectItem>
                              {sortByLocaleKey(rateList.filter((r) => r.category === cat), "item_name").map((r) => (
                                <SelectItem key={r.item_name} value={r.item_name}>
                                  {r.item_name} - {formatCurrencyAmount(r.price, companySettings[0])}
                                </SelectItem>
                              ))}
                            </React.Fragment>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-2"><Input type="number" min={1} className="h-9 text-xs" value={item.quantity} onChange={e => updateItem(idx, 'quantity', Number(e.target.value))} placeholder="Qty" /></div>
                    <div className="col-span-2"><Input type="number" className="h-9 text-xs" value={item.rate} onChange={e => updateItem(idx, 'rate', Number(e.target.value))} placeholder="Rate" /></div>
                    <div className="col-span-2 text-sm font-medium pt-2">{formatCurrencyAmount(item.amount || 0, companySettings[0])}</div>
                    <div className="col-span-2">{canEditBills && <Button type="button" variant="ghost" size="icon" className="h-9 w-9 text-destructive" onClick={() => removeItem(idx)}><Trash2 className="w-3.5 h-3.5" /></Button>}</div>
                  </div>
                ))}
              </div>
              {form.items.length > 0 && <div className="text-right mt-2 font-bold text-lg">Total: {formatCurrencyAmount(form.items.reduce((s, i) => s + (i.amount || 0), 0), companySettings[0])}</div>}
            </div>
            {companySettings[0]?.enable_bill_receipts && (
              <div>
                <Label>Receipt (Image/PDF)</Label>
                {canUploadBills ? (
                  <FileUploadButton fileUrl={form.receipt_url} onFileUpload={(url) => setForm({ ...form, receipt_url: url })} onFileDelete={() => setForm({ ...form, receipt_url: '' })} label="Upload Receipt" />
                ) : (
                  <p className="text-xs text-muted-foreground py-1">Receipt upload is not allowed for your role.</p>
                )}
              </div>
            )}
            <div><Label>Remarks</Label><Input value={form.remarks} onChange={e => setForm({ ...form, remarks: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button
              type="button"
              onClick={() => {
                if (!form.pickup_employee_id) { toast.error("Pickup By / Salesman is required"); return; }
                if (!form.pickup_date) { toast.error("Pickup Date is required"); return; }
                if (form.items.length === 0) { toast.error("Add at least 1 item"); return; }
                if (form.items.some((i) => !i.item_name)) { toast.error("Select an item name for every line"); return; }
                if (billNumberConflict) { toast.error("This bill number is already in use. Enter a unique number."); return; }
                saveMutation.mutate(form);
              }}
              disabled={!canEditBills || !form.bill_number?.trim() || !form.customer_id || billNumberConflict || saveMutation.isPending}
            >
              {editingBill ? "Update" : "Create"} Bill
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmModal open={!!confirmAction} onClose={() => setConfirmAction(null)} onConfirm={() => { deleteMutation.mutate(confirmAction.ids); setConfirmAction(null); }} title="Move bills to Trash" description={`Move ${confirmAction?.ids?.length || 0} bill(s) and their line items / payments to Trash? Vendor payment expense lines linked to these bills are removed from Expenses (same as before). You can restore bills from Administration → Trash Bin.`} confirmText="Move to Trash" destructive />

      <BillNotificationDialog
        open={!!notifyContext}
        onOpenChange={(open) => !open && setNotifyContext(null)}
        bill={notifyContext?.bill}
        items={notifyContext?.items}
        customer={notifyContext?.customer}
        companySettings={companySettings[0]}
        initialChannel={notifyContext?.initialChannel || "email"}
        canSend={canNotifyCustomer}
      />
    </div>
  );
}