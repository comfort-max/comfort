import React, { useState, useMemo } from "react";
import { db, sendEmail } from "@/services/SupabaseService";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import PageHeader from "@/components/shared/PageHeader";
import { generatePdfBase64 } from "@/utils/generatePdfBase64";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import StatusBadge from "@/components/shared/StatusBadge";
import ReminderModal from "@/components/shared/ReminderModal";
import ConfirmModal from "@/components/shared/ConfirmModal";
import { Bell, History, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { formatPeriodForExport, normalizeFinancialYearRule } from "@/lib/financialYear";
import { formatCurrencyAmount } from "@/lib/currency";
import { buildWhatsappMeUrl } from "@/lib/whatsappLink";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getBillSalesmanDisplayName } from "@/lib/billSalesman";
import { sortStringsForDisplay } from "@/lib/utils";
import { useCommunicationTemplates } from "@/hooks/useCommunicationTemplates";
import {
  buildPaymentReminderVars,
  getDefaultEmailTemplate,
  resolveRenderedMessage,
} from "@/lib/communicationTemplate";

export default function OutstandingReports() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { can } = usePermissions();
  const canReminderSend = can("reports_outstanding", "reminder_send");
  const canReminderLogDelete = can("reports_outstanding", "reminder_log_delete");
  const [reminderModal, setReminderModal] = useState(null);
  const [selectedLogIds, setSelectedLogIds] = useState([]);
  const [confirmDeleteLogs, setConfirmDeleteLogs] = useState(false);

  const [billDateFrom, setBillDateFrom] = useState("");
  const [billDateTo, setBillDateTo] = useState("");
  const [filterCustomerWise, setFilterCustomerWise] = useState("");
  const [filterDayCustomer, setFilterDayCustomer] = useState("");
  const [filterDaySalesman, setFilterDaySalesman] = useState("");
  const [filterSalesmanWise, setFilterSalesmanWise] = useState("");
  const [filterReminderRecipient, setFilterReminderRecipient] = useState("");

  const { data: bills = [] } = useQuery({ queryKey: ['bills-outstanding'], queryFn: () => db.Bill.list('-bill_date', 2000) });
  const { data: billItems = [] } = useQuery({ queryKey: ['bill-items-outstanding'], queryFn: () => db.BillItem.list('-created_date', 2000) });
  const { data: customers = [] } = useQuery({ queryKey: ['customers-all'], queryFn: () => db.Customer.list(), staleTime: 30 * 60 * 1000 });
  const { data: companySettings = [] } = useQuery({ queryKey: ['company-settings'], queryFn: () => db.CompanySettings.list() });
  const { data: commTemplates = [] } = useCommunicationTemplates();
  const { data: reminderLogs = [] } = useQuery({ queryKey: ['reminder-logs'], queryFn: () => db.ReminderLog.filter({ reminder_type: 'payment' }) });

  const fyRule = useMemo(() => normalizeFinancialYearRule(companySettings[0]), [companySettings]);
  const settingsRow = companySettings[0];

  const outstanding = useMemo(() => {
    const base = bills.filter(b => (b.amount_due || 0) > 0);
    return base.filter(b => {
      if (billDateFrom && b.bill_date < billDateFrom) return false;
      if (billDateTo && b.bill_date > billDateTo) return false;
      return true;
    });
  }, [bills, billDateFrom, billDateTo]);

  const periodLabel = formatPeriodForExport(billDateFrom, billDateTo, fyRule);

  const itemsByBill = useMemo(() => {
    const m = {};
    billItems.forEach(item => { if (!m[item.bill_id]) m[item.bill_id] = []; m[item.bill_id].push(item); });
    return m;
  }, [billItems]);

  const getDeliveryDate = (billId) => { const items = itemsByBill[billId] || []; const item = items.find(i => i.delivery_date && (i.delivery_status === 'delivered_unpaid' || i.delivery_status === 'delivered_paid')); return item?.delivery_date || '-'; };

  const byCustomerDetailed = useMemo(() => {
    const m = {};
    outstanding.forEach(b => { const name = b.customer_name || 'Unknown'; if (!m[name]) m[name] = []; const items = itemsByBill[b.id] || []; m[name].push({ billNumber: b.bill_number, billDate: b.bill_date, deliveryDate: getDeliveryDate(b.id), totalAmount: b.total_amount || 0, amountPaid: b.amount_paid || 0, amountDue: b.amount_due || 0, items: items.map(i => `${i.item_name} x${i.quantity}`).join(', ') }); });
    return m;
  }, [outstanding, itemsByBill]);

  const byDayDetailed = useMemo(() => {
    const m = {};
    outstanding.forEach(b => {
      const day = b.bill_date || 'Unknown';
      if (!m[day]) m[day] = [];
      const items = itemsByBill[b.id] || [];
      m[day].push({
        billNumber: b.bill_number,
        customerName: b.customer_name || '-',
        collectedBy: getBillSalesmanDisplayName(b) || 'Unknown',
        deliveryDate: getDeliveryDate(b.id),
        totalAmount: b.total_amount || 0,
        amountPaid: b.amount_paid || 0,
        amountDue: b.amount_due || 0,
        items: items.map(i => `${i.item_name} x${i.quantity}`).join(', '),
      });
    });
    return m;
  }, [outstanding, itemsByBill]);

  const bySalesmanDetailed = useMemo(() => {
    const m = {};
    outstanding.forEach(b => {
      const name = getBillSalesmanDisplayName(b) || 'Unknown';
      if (!m[name]) m[name] = [];
      const items = itemsByBill[b.id] || [];
      m[name].push({
        billNumber: b.bill_number,
        billDate: b.bill_date,
        customerName: b.customer_name || '-',
        deliveryDate: getDeliveryDate(b.id),
        totalAmount: b.total_amount || 0,
        amountPaid: b.amount_paid || 0,
        amountDue: b.amount_due || 0,
        items: items.map(i => `${i.item_name} x${i.quantity}`).join(', '),
      });
    });
    return m;
  }, [outstanding, itemsByBill]);

  const dayFilterCustomerOptions = useMemo(() => {
    const s = new Set();
    outstanding.forEach(b => { if (b.customer_name?.trim()) s.add(b.customer_name); });
    return [...s].sort((a, b) => a.localeCompare(b));
  }, [outstanding]);

  const dayFilterSalesmanOptions = useMemo(() => {
    const s = new Set();
    outstanding.forEach(b => {
      const n = getBillSalesmanDisplayName(b);
      s.add(n || 'Unknown');
    });
    return [...s].sort((a, b) => a.localeCompare(b));
  }, [outstanding]);

  const salesmanWiseFilterOptions = useMemo(() => [...Object.keys(bySalesmanDetailed)].sort((a, b) => a.localeCompare(b)), [bySalesmanDetailed]);

  const customerWiseFilterOptions = useMemo(() => [...Object.keys(byCustomerDetailed)].sort((a, b) => a.localeCompare(b)), [byCustomerDetailed]);

  const filteredCustomerTabEntries = useMemo(() => {
    let entries = Object.entries(byCustomerDetailed).sort(([, a], [, b]) => b.length - a.length);
    if (filterCustomerWise) entries = entries.filter(([name]) => name === filterCustomerWise);
    return entries;
  }, [byCustomerDetailed, filterCustomerWise]);

  const filteredSalesmanTabEntries = useMemo(() => {
    let entries = Object.entries(bySalesmanDetailed).sort(([, a], [, b]) => b.length - a.length);
    if (filterSalesmanWise) entries = entries.filter(([name]) => name === filterSalesmanWise);
    return entries;
  }, [bySalesmanDetailed, filterSalesmanWise]);

  const displayedPaymentReminderLogs = useMemo(() => {
    if (!filterReminderRecipient) return reminderLogs;
    return reminderLogs.filter(l => l.recipient_name === filterReminderRecipient);
  }, [reminderLogs, filterReminderRecipient]);

  const reminderRecipientOptions = useMemo(() => {
    const s = new Set();
    reminderLogs.forEach(l => { if (l.recipient_name?.trim()) s.add(l.recipient_name); });
    return [...s].sort((a, b) => a.localeCompare(b));
  }, [reminderLogs]);

  const DetailedTable = ({ data, columns }) => (
    <div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="border-b bg-muted/50 text-muted-foreground">{columns.map(col => <th key={col.key} className="text-left px-3 py-2">{col.header}</th>)}</tr></thead><tbody>{data.map((row, idx) => (<tr key={idx} className="border-b last:border-0 hover:bg-muted/20">{columns.map(col => <td key={col.key} className="px-3 py-2">{col.render ? col.render(row) : row[col.key] || '-'}</td>)}</tr>))}{data.length === 0 && <tr><td colSpan={columns.length} className="text-center py-8 text-muted-foreground">No data</td></tr>}</tbody></table></div>
  );

  const deleteLogsMutation = useMutation({
    mutationFn: (ids) => Promise.all(ids.map(id => db.ReminderLog.delete(id))),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['reminder-logs'] }); setSelectedLogIds([]); setConfirmDeleteLogs(false); toast.success("Logs deleted"); }
  });

  const sendReminderMutation = useMutation({
    mutationFn: async (payload) => {
      const { selectedCustomers, channels } = payload;
      const companyName = companySettings[0]?.company_name || 'COMFORT';
      let success = 0, failed = 0;

      for (const customer of selectedCustomers) {
        const customerBills = outstanding.filter(b => b.customer_id === customer.id);
        const totalDue = customerBills.reduce((s, b) => s + (b.amount_due || 0), 0);
        const vars = buildPaymentReminderVars({ customer, bills: customerBills, companySettings: settingsRow });
        const fallback = getDefaultEmailTemplate("payment_reminder_customer");
        const rendered = resolveRenderedMessage({
          templates: commTemplates,
          purpose: "payment_reminder_customer",
          channel: "email",
          vars,
          fallbackSubject: fallback.subject,
          fallbackBody: `Dear ${customer.name},\n\nOutstanding Bills:\n${vars.bill_list}\n\nTotal Outstanding: ${vars.total_outstanding}\n\nBest Regards,\n${companyName}`,
        });

        if (channels.sendEmail && customer.email) {
          try {
            await sendEmail({
              to: customer.email,
              subject: rendered.subject || "Payment Reminder — Outstanding Bills",
              body: rendered.body,
              fromName: companySettings[0]?.email_from_name || companyName,
            });
            success++;
            await db.ReminderLog.create({
              reminder_type: 'payment',
              recipient_name: customer.name,
              recipient_email: customer.email || '',
              recipient_phone: customer.phone || '',
              channels: ['email'],
              related_bills: customerBills.map(b => b.bill_number).join(', '),
              amount: totalDue,
              sent_date: new Date().toISOString().slice(0, 10),
              sent_by: user?.full_name || user?.email || '',
              status: 'success',
            });
          } catch {
            failed++;
          }
        } else if (channels.sendEmail && !customer.email) {
          failed++;
        }
      }
      return { success, failed };
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['reminder-logs'] });
      toast.success(`Email reminders: ${result.success} sent${result.failed > 0 ? `, ${result.failed} skipped (no email or failed)` : ''}`);
      setReminderModal(null);
    }
  });

  const buildPaymentReminderWhatsappBody = (rec) => {
    const customer = rec.customerData || customers.find(c => c.name === rec.name);
    if (!customer) return '';
    const companyName = companySettings[0]?.company_name || 'COMFORT';
    const customerBills = outstanding.filter(b => b.customer_id === customer.id);
    const vars = buildPaymentReminderVars({ customer, bills: customerBills, companySettings: settingsRow });
    const fallback = getDefaultEmailTemplate("payment_reminder_customer");
    return resolveRenderedMessage({
      templates: commTemplates,
      purpose: "payment_reminder_customer",
      channel: "whatsapp",
      vars,
      fallbackSubject: "",
      fallbackBody: fallback.body || `Dear ${customer.name},\n\nOutstanding Bills:\n${vars.bill_list}\n\nTotal: ${vars.total_outstanding}\n\nBest Regards,\n${companyName}`,
    }).body;
  };

  const openWhatsappPaymentReminders = async (selectedRecipients, opts = {}) => {
    const sentDate = new Date().toISOString().slice(0, 10);
    const useSingleEditedBody = opts?.message != null && selectedRecipients.length === 1;
    let opened = 0;
    for (let i = 0; i < selectedRecipients.length; i++) {
      const rec = selectedRecipients[i];
      const customer = rec.customerData || customers.find(c => c.name === rec.name);
      if (!customer) continue;
      const customerBills = outstanding.filter(b => b.customer_id === customer.id);
      const totalDue = customerBills.reduce((s, b) => s + (b.amount_due || 0), 0);
      const body = useSingleEditedBody ? opts.message : buildPaymentReminderWhatsappBody(rec);
      const url = buildWhatsappMeUrl(customer.phone, body);
      if (url) {
        window.open(url, '_blank', 'noopener,noreferrer');
        opened++;
        await db.ReminderLog.create({
          reminder_type: 'payment',
          recipient_name: customer.name,
          recipient_email: customer.email || '',
          recipient_phone: customer.phone || '',
          channels: ['whatsapp'],
          related_bills: customerBills.map(b => b.bill_number).join(', '),
          amount: totalDue,
          sent_date: sentDate,
          sent_by: user?.full_name || user?.email || '',
          status: 'success',
        });
      }
      if (i < selectedRecipients.length - 1) await new Promise((r) => setTimeout(r, 450));
    }
    qc.invalidateQueries({ queryKey: ['reminder-logs'] });
    toast.success(opened > 0 ? `Opened WhatsApp for ${opened} recipient(s). Send each chat manually, then close the tabs you do not need.` : 'WhatsApp opened.');
  };

  const FilterBar = ({ children }) => <div className="flex gap-3 mb-4 flex-wrap items-end">{children}</div>;
  const FilterSelect = ({ label, value, onChange, options, placeholder = "All" }) => {
    const clean = sortStringsForDisplay((options || []).filter((o) => o != null && String(o).trim() !== ""));
    return (
      <div className="min-w-[180px]">
        <Label className="text-xs">{label}</Label>
        <Select value={value || '__all__'} onValueChange={v => onChange(v === '__all__' ? '' : v)}>
          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder={placeholder} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">{placeholder}</SelectItem>
            {clean.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    );
  };

  return (
    <div>
      <PageHeader title="Outstanding Reports" subtitle={`${outstanding.length} bills · ${formatCurrencyAmount(outstanding.reduce((s,b)=>s+(b.amount_due||0),0), settingsRow)} outstanding`} permissionResource="reports_outstanding" dateRange={periodLabel} exportData={outstanding.map(b => ({ 'Bill #': b.bill_number, 'Bill Date': b.bill_date, Customer: b.customer_name, Salesman: getBillSalesmanDisplayName(b) || '-', 'Total Amount': b.total_amount||0, 'Amount Paid': b.amount_paid||0, 'Amount Due': b.amount_due||0 }))} />
      <div className="flex gap-3 mb-4 items-end flex-wrap">
        <div><Label className="text-xs">Bill date from</Label><Input type="date" className="h-9 w-40" value={billDateFrom} onChange={e => setBillDateFrom(e.target.value)} /></div>
        <div><Label className="text-xs">Bill date to</Label><Input type="date" className="h-9 w-40" value={billDateTo} onChange={e => setBillDateTo(e.target.value)} /></div>
      </div>
      <Tabs defaultValue="customer">
        <TabsList className="mb-4">
          <TabsTrigger value="customer">Customer-wise</TabsTrigger>
          <TabsTrigger value="day">Day-wise</TabsTrigger>
          <TabsTrigger value="salesman">Salesman-wise</TabsTrigger>
          <TabsTrigger value="log" className="gap-1"><History className="w-3.5 h-3.5" />Reminder History</TabsTrigger>
        </TabsList>
        <TabsContent value="customer">
          <FilterBar>
            <FilterSelect label="Customer" value={filterCustomerWise} onChange={setFilterCustomerWise} options={customerWiseFilterOptions} placeholder="All customers" />
          </FilterBar>
          <div className="mb-4 flex justify-end">{canReminderSend && <Button size="sm" className="gap-1" onClick={() => { const recipients = Object.entries(byCustomerDetailed).map(([name, items]) => { const customerData = customers.find(c => c.name === name); return { id: name, name, detail: `${items.length} bills · ${formatCurrencyAmount(items.reduce((s,i)=>s+i.amountDue,0), settingsRow)} outstanding`, customerData }; }); setReminderModal({ recipients }); }}><Bell className="w-4 h-4" /> Send Payment Reminders</Button>}</div>
          {filteredCustomerTabEntries.map(([name, items]) => (<Card key={name} className="mb-4 border-0 shadow-sm"><CardHeader><CardTitle className="text-sm">{name} - {items.length} bills · {formatCurrencyAmount(items.reduce((s,i)=>s+i.amountDue,0), settingsRow)} outstanding</CardTitle></CardHeader><CardContent><DetailedTable data={items} columns={[{key:'billNumber',header:'Bill #'},{key:'billDate',header:'Bill Date'},{key:'deliveryDate',header:'Delivery'},{key:'items',header:'Items'},{key:'totalAmount',header:'Total',render:r=>formatCurrencyAmount(r.totalAmount, settingsRow)},{key:'amountPaid',header:'Paid',render:r=>formatCurrencyAmount(r.amountPaid, settingsRow)},{key:'amountDue',header:'Outstanding',render:r=>formatCurrencyAmount(r.amountDue, settingsRow)}]}/></CardContent></Card>))}
          {filteredCustomerTabEntries.length === 0 && <div className="text-center py-12 text-muted-foreground">No data for this filter</div>}
        </TabsContent>
        <TabsContent value="day">
          <FilterBar>
            <FilterSelect label="Customer" value={filterDayCustomer} onChange={setFilterDayCustomer} options={dayFilterCustomerOptions} placeholder="All customers" />
            <FilterSelect label="Salesman" value={filterDaySalesman} onChange={setFilterDaySalesman} options={dayFilterSalesmanOptions} placeholder="All salesmen" />
          </FilterBar>
          {Object.entries(byDayDetailed).sort(([a],[b]) => b.localeCompare(a)).map(([day, items]) => {
            const rows = items.filter(row =>
              (!filterDayCustomer || row.customerName === filterDayCustomer) &&
              (!filterDaySalesman || row.collectedBy === filterDaySalesman)
            );
            if (rows.length === 0 && (filterDayCustomer || filterDaySalesman)) return null;
            const displayItems = (filterDayCustomer || filterDaySalesman) ? rows : items;
            return (
              <Card key={day} className="mb-4 border-0 shadow-sm">
                <CardHeader><CardTitle className="text-sm">{day} - {displayItems.length} bills · {formatCurrencyAmount(displayItems.reduce((s,i)=>s+i.amountDue,0), settingsRow)} outstanding</CardTitle></CardHeader>
                <CardContent><DetailedTable data={displayItems} columns={[{key:'billNumber',header:'Bill #'},{key:'customerName',header:'Customer'},{key:'collectedBy',header:'Salesman'},{key:'deliveryDate',header:'Delivery'},{key:'totalAmount',header:'Total',render:r=>formatCurrencyAmount(r.totalAmount, settingsRow)},{key:'amountPaid',header:'Paid',render:r=>formatCurrencyAmount(r.amountPaid, settingsRow)},{key:'amountDue',header:'Outstanding',render:r=>formatCurrencyAmount(r.amountDue, settingsRow)}]}/></CardContent>
              </Card>
            );
          })}
        </TabsContent>
        <TabsContent value="salesman">
          <FilterBar>
            <FilterSelect label="Salesman" value={filterSalesmanWise} onChange={setFilterSalesmanWise} options={salesmanWiseFilterOptions} placeholder="All salesmen" />
          </FilterBar>
          {filteredSalesmanTabEntries.map(([name, items]) => (<Card key={name} className="mb-4 border-0 shadow-sm"><CardHeader><CardTitle className="text-sm">{name} - {items.length} bills · {formatCurrencyAmount(items.reduce((s,i)=>s+i.amountDue,0), settingsRow)} outstanding</CardTitle></CardHeader><CardContent><DetailedTable data={items} columns={[{key:'billNumber',header:'Bill #'},{key:'billDate',header:'Bill Date'},{key:'customerName',header:'Customer'},{key:'deliveryDate',header:'Delivery'},{key:'totalAmount',header:'Total',render:r=>formatCurrencyAmount(r.totalAmount, settingsRow)},{key:'amountPaid',header:'Paid',render:r=>formatCurrencyAmount(r.amountPaid, settingsRow)},{key:'amountDue',header:'Outstanding',render:r=>formatCurrencyAmount(r.amountDue, settingsRow)}]}/></CardContent></Card>))}
          {filteredSalesmanTabEntries.length === 0 && <div className="text-center py-12 text-muted-foreground">No data for this filter</div>}
        </TabsContent>
        <TabsContent value="log">
          <Card className="border-0 shadow-sm">
            <CardHeader className="flex-row items-center justify-between flex-wrap gap-2">
              <CardTitle className="text-sm">Reminder History</CardTitle>
              {canReminderLogDelete && selectedLogIds.length > 0 && <Button size="sm" variant="destructive" className="gap-1" onClick={() => setConfirmDeleteLogs(true)}><Trash2 className="w-3.5 h-3.5" /> Delete ({selectedLogIds.length})</Button>}
            </CardHeader>
            <CardContent>
              <FilterBar>
                <FilterSelect label="Recipient" value={filterReminderRecipient} onChange={setFilterReminderRecipient} options={reminderRecipientOptions} placeholder="All recipients" />
              </FilterBar>
              <div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="border-b bg-muted/50 text-muted-foreground">{canReminderLogDelete && <th className="px-3 py-2 w-8"><Checkbox checked={selectedLogIds.length === displayedPaymentReminderLogs.length && displayedPaymentReminderLogs.length > 0} onCheckedChange={(checked) => setSelectedLogIds(checked ? displayedPaymentReminderLogs.map(l => l.id) : [])} /></th>}<th className="text-left px-3 py-2">Date</th><th className="text-left px-3 py-2">Recipient</th><th className="text-left px-3 py-2">Channels</th><th className="text-left px-3 py-2">Bills</th><th className="text-left px-3 py-2">Amount</th><th className="text-left px-3 py-2">Status</th><th className="text-left px-3 py-2">Sent By</th></tr></thead>
              <tbody>
                {reminderLogs.length === 0 ? <tr><td colSpan={canReminderLogDelete ? 8 : 7} className="text-center py-8 text-muted-foreground">No reminders sent yet</td></tr> : displayedPaymentReminderLogs.length === 0 ? <tr><td colSpan={canReminderLogDelete ? 8 : 7} className="text-center py-8 text-muted-foreground">No rows for this recipient</td></tr> : displayedPaymentReminderLogs.map(log => (
                  <tr key={log.id} className="border-b last:border-0 hover:bg-muted/20">
                    {canReminderLogDelete && <td className="px-3 py-2"><Checkbox checked={selectedLogIds.includes(log.id)} onCheckedChange={(checked) => setSelectedLogIds(prev => checked ? [...prev, log.id] : prev.filter(id => id !== log.id))} /></td>}
                    <td className="px-3 py-2">{log.sent_date}</td><td className="px-3 py-2 font-medium">{log.recipient_name}</td><td className="px-3 py-2">{log.channels?.join(', ') || '-'}</td><td className="px-3 py-2 text-muted-foreground">{log.related_bills}</td><td className="px-3 py-2">{formatCurrencyAmount(log.amount || 0, settingsRow)}</td><td className="px-3 py-2"><StatusBadge status={log.status} /></td><td className="px-3 py-2 text-muted-foreground">{log.sent_by}</td>
                  </tr>
                ))}
              </tbody></table></div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      <ConfirmModal open={confirmDeleteLogs} onClose={() => setConfirmDeleteLogs(false)} onConfirm={() => deleteLogsMutation.mutate(selectedLogIds)} title="Delete Reminder Logs" description={`Permanently delete ${selectedLogIds.length} log record(s)?`} confirmText="Delete" destructive />
      <ReminderModal
        open={!!reminderModal}
        onClose={() => setReminderModal(null)}
        title="Send Payment Reminders"
        recipients={reminderModal?.recipients || []}
        onSend={async (selectedRecipients, channels) => {
          const selectedCustomers = selectedRecipients.map(r => customers.find(c => c.name === r.name)).filter(Boolean);
          if (selectedCustomers.length > 0) await sendReminderMutation.mutateAsync({ selectedCustomers, channels });
        }}
        onOpenWhatsApp={openWhatsappPaymentReminders}
        getWhatsAppDraft={(selected) => buildPaymentReminderWhatsappBody(selected[0])}
        getRecipientPhone={(r) => r.customerData?.phone}
        getRecipientEmail={(r) => r.customerData?.email}
        loading={sendReminderMutation.isPending}
        previewEmail={(recipient) => {
          const customer = customers.find(c => c.name === recipient.name);
          const customerBills = outstanding.filter(b => b.customer_id === customer?.id);
          const totalDue = customerBills.reduce((s,b)=>s+(b.amount_due||0),0);
          const billList = customerBills.map(b=>`- Bill #${b.bill_number}: ${formatCurrencyAmount(b.amount_due, settingsRow)}`).join('\n');
          return { subject: 'Payment Reminder - Outstanding Bills', body: `Dear ${recipient.name},\n\nOutstanding Bills:\n${billList}\n\nTotal: ${formatCurrencyAmount(totalDue, settingsRow)}\n\nBest Regards,\n${companySettings[0]?.company_name || 'COMFORT'}`, recipient: { name: recipient.name, email: customer?.email || '' } };
        }}
      />
    </div>
  );
}