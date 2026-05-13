import React, { useState, useMemo, useEffect } from "react";
import { db, sendEmail } from "@/services/SupabaseService";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import PageHeader from "@/components/shared/PageHeader";
import StatusBadge from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Package, FilePlus, Eye, Printer, CheckSquare, ChevronDown, ChevronRight, Mail, MessageSquare, Download, Trash2, Undo2 } from "lucide-react";
import ConfirmModal from "@/components/shared/ConfirmModal";
import EmailPreviewDialog from "@/components/shared/EmailPreviewDialog";
import { format } from "date-fns";
import { exportPDF } from "@/components/shared/exportPDF";
import { generatePdfBase64 } from "@/utils/generatePdfBase64";
import { useAuth } from "@/lib/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { formatCurrencyAmount, getCurrencyConfig } from "@/lib/currency";
import { useAppCurrency } from "@/hooks/useAppCurrency";
import { sortByLocaleKey } from "@/lib/utils";
import { buildWhatsappMeUrl } from "@/lib/whatsappLink";

export default function VendorJobs() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { can } = usePermissions();
  const canEditVendorJobs = can("vendor_jobs", "edit");
  const canPoIssue = can("vendor_jobs", "po_issue");
  const canPoCancel = can("vendor_jobs", "po_cancel");
  const canPoSend = can("vendor_jobs", "po_send");
  const canExportVendorJobs = can("vendor_jobs", "export");
  const canSelectPendingItems = canEditVendorJobs || canPoIssue;
  const { format: fmt } = useAppCurrency();
  const [vendorFilter, setVendorFilter] = useState("all");
  const [selectedPO, setSelectedPO] = useState(null);
  const [expandedVendors, setExpandedVendors] = useState({});
  const [selectedItemIds, setSelectedItemIds] = useState({});
  const [reassignDialog, setReassignDialog] = useState(null);
  const [selectedPoIds, setSelectedPoIds] = useState([]);
  const [confirmDeletePOs, setConfirmDeletePOs] = useState(false);
  const [confirmCancelPO, setConfirmCancelPO] = useState(null);

  const { data: billItems = [] } = useQuery({
    queryKey: ["bill-items-vj"],
    queryFn: () => db.BillItem.list("-created_date", 2000),
    staleTime: 60 * 1000,
  });
  const { data: vendors = [] } = useQuery({ queryKey: ['vendors-active'], queryFn: () => db.Vendor.filter({ status: 'active' }), staleTime: 20 * 60 * 1000 });
  const { data: bills = [] } = useQuery({
    queryKey: ["bills-vj"],
    queryFn: () => db.Bill.list("-created_date", 500),
    staleTime: 60 * 1000,
  });
  const { data: vendorOrders = [] } = useQuery({
    queryKey: ["vendor-orders"],
    queryFn: () => db.VendorOrder.list("-order_date", 200),
    staleTime: 60 * 1000,
  });

  const vendorsSorted = useMemo(() => sortByLocaleKey(vendors), [vendors]);

  const getBill = (billId) => bills.find(b => b.id === billId);
  const assignedItems = billItems.filter(i => i.vendor_id && !['delivered_paid'].includes(i.delivery_status));

  const vendorGroups = useMemo(() => {
    const filtered = vendorFilter === 'all' ? assignedItems : assignedItems.filter(i => i.vendor_id === vendorFilter);
    const groups = {};
    filtered.forEach(item => {
      const vid = item.vendor_id;
      if (!groups[vid]) groups[vid] = { vendor_id: vid, vendor_name: item.vendor_name, items: [] };
      groups[vid].items.push(item);
    });
    return groups;
  }, [assignedItems, vendorFilter]);

  const toggleVendor = (vid) => setExpandedVendors(prev => ({ ...prev, [vid]: !prev[vid] }));
  const isExpanded = (vid) => expandedVendors[vid] !== false;
  const getSelected = (vid) => selectedItemIds[vid] || [];
  const setSelected = (vid, ids) => setSelectedItemIds(prev => ({ ...prev, [vid]: ids }));
  const toggleItem = (vid, itemId) => { const cur = getSelected(vid); setSelected(vid, cur.includes(itemId) ? cur.filter(i => i !== itemId) : [...cur, itemId]); };
  const toggleAllForVendor = (vid, items) => { const noPO = items.filter(i => !i.vendor_order_id); const cur = getSelected(vid); setSelected(vid, cur.length === noPO.length ? [] : noPO.map(i => i.id)); };

  const generatePOMutation = useMutation({
    mutationFn: async ({ vendorId, vendorName, itemIds }) => {
      const items = billItems.filter(i => itemIds.includes(i.id));
      const totalItems = items.reduce((s, i) => s + (i.quantity || 1), 0);
      const totalAmount = items.reduce((s, i) => s + (i.vendor_amount || 0), 0);
      const existingPOs = vendorOrders.filter(o => o.vendor_id === vendorId);
      const poSeq = (existingPOs.length + 1).toString().padStart(3, '0');
      const orderNumber = `PO-${format(new Date(), 'yyMMdd')}-${poSeq}`;
      const po = await db.VendorOrder.create({ order_number: orderNumber, vendor_id: vendorId, vendor_name: vendorName, order_date: format(new Date(), 'yyyy-MM-dd'), total_items: totalItems, total_amount: totalAmount, amount_paid: 0, amount_due: totalAmount, payment_status: 'pending', status: 'active', entry_by: user?.full_name || user?.email || '', entry_timestamp: new Date().toISOString() });
      await Promise.all(items.map(item => db.BillItem.update(item.id, { vendor_order_id: po.id })));
      return po;
    },
    onSuccess: (po) => { qc.invalidateQueries({ queryKey: ['bill-items-vj'] }); qc.invalidateQueries({ queryKey: ['bill-items-vo'] }); qc.invalidateQueries({ queryKey: ['bill-items-delivery'] }); qc.invalidateQueries({ queryKey: ['vendor-orders'] }); toast.success(`PO ${po.order_number} generated`); setSelectedItemIds({}); }
  });

  const markReadyMutation = useMutation({
    mutationFn: async (itemIds) => { await Promise.all(itemIds.map(id => db.BillItem.update(id, { delivery_status: 'ready_for_delivery' }))); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['bill-items-vj'] }); toast.success("Marked as ready"); setSelectedItemIds({}); }
  });

  const markNotReadyMutation = useMutation({
    mutationFn: async (itemIds) => { await Promise.all(itemIds.map(id => db.BillItem.update(id, { delivery_status: 'with_vendor' }))); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['bill-items-vj'] }); toast.success("Marked as not ready"); setSelectedItemIds({}); }
  });

  const reassignMutation = useMutation({
    mutationFn: async ({ itemIds, newVendorId, newVendorName }) => {
      const rates = await db.VendorRate.filter({ vendor_id: newVendorId });
      const vendorRatesMap = {};
      rates.forEach(r => { vendorRatesMap[r.item_name] = r.price; });
      await Promise.all(itemIds.map(id => {
        const item = billItems.find(i => i.id === id);
        const newRate = vendorRatesMap[item?.item_name] || item?.vendor_rate || 0;
        const newAmount = (item?.quantity || 0) * newRate;
        return db.BillItem.update(id, { vendor_id: newVendorId, vendor_name: newVendorName, vendor_rate: newRate, vendor_amount: newAmount, vendor_order_id: null });
      }));
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['bill-items-vj'] }); toast.success("Items reassigned"); setSelectedItemIds({}); }
  });

  const getPOForVendor = (vid) => vendorOrders.filter(o => o.vendor_id === vid).sort((a, b) => b.order_date?.localeCompare(a.order_date));
  const getPOItems = (poId) => billItems.filter(i => i.vendor_order_id === poId);

  const orphanedPOs = useMemo(
    () => vendorOrders.filter((po) => !billItems.some((i) => i.vendor_order_id === po.id)),
    [vendorOrders, billItems]
  );

  const togglePoSelect = (poId) => {
    setSelectedPoIds((prev) =>
      prev.includes(poId) ? prev.filter((id) => id !== poId) : [...prev, poId]
    );
  };

  const deletePOMutation = useMutation({
    mutationFn: async (poIds) => {
      for (const poId of poIds) {
        const linked = billItems.filter((i) => i.vendor_order_id === poId);
        await Promise.all(
          linked.map((i) => db.BillItem.update(i.id, { vendor_order_id: null }))
        );
        await db.VendorOrder.delete(poId);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vendor-orders"] });
      qc.invalidateQueries({ queryKey: ["bill-items-vj"] });
      qc.invalidateQueries({ queryKey: ["bill-items-vo"] });
      qc.invalidateQueries({ queryKey: ["bill-items-delivery"] });
      setSelectedPoIds([]);
      setConfirmDeletePOs(false);
      setConfirmCancelPO(null);
      toast.success("PO cancelled — line items are unlinked. You can reassign them or generate a new PO.");
    },
    onError: (e) => toast.error(e?.message || "Could not delete PO(s)"),
  });

  return (
    <div>
      <PageHeader title="Vendor Jobs" subtitle="Manage vendor POs and item readiness" permissionResource="vendor_jobs">
        <Select value={vendorFilter} onValueChange={setVendorFilter}>
          <SelectTrigger className="w-44"><SelectValue placeholder="All Vendors" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Vendors</SelectItem>
            {vendorsSorted.map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </PageHeader>

      {canPoCancel && orphanedPOs.length > 0 && (
        <Card className="mb-4 border-amber-200 bg-amber-50/50 dark:bg-amber-950/20">
          <CardHeader className="py-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Trash2 className="w-4 h-4 text-amber-700" /> Orphaned purchase orders
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-muted-foreground space-y-2">
            <p>These POs are not linked to any bill line item—often from older data. Select and delete to clean up.</p>
            <div className="border rounded-md overflow-hidden bg-background">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 border-b text-xs text-muted-foreground">
                    <th className="w-10 px-2 py-1.5" />
                    <th className="text-left px-2 py-1.5">PO #</th>
                    <th className="text-left px-2 py-1.5">Vendor</th>
                    <th className="text-left px-2 py-1.5">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {orphanedPOs.map((po) => (
                    <tr key={po.id} className="border-b last:border-0">
                      <td className="px-2 py-1.5">
                        <Checkbox
                          checked={selectedPoIds.includes(po.id)}
                          onCheckedChange={() => togglePoSelect(po.id)}
                        />
                      </td>
                      <td className="px-2 py-1.5 font-medium">{po.order_number}</td>
                      <td className="px-2 py-1.5">{po.vendor_name}</td>
                      <td className="px-2 py-1.5">{po.order_date}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 text-xs"
              onClick={() =>
                setSelectedPoIds((prev) => {
                  const ids = orphanedPOs.map((o) => o.id);
                  const allOn = ids.every((id) => prev.includes(id));
                  return allOn ? prev.filter((id) => !ids.includes(id)) : [...new Set([...prev, ...ids])];
                })
              }
            >
              Toggle all orphaned
            </Button>
          </CardContent>
        </Card>
      )}

      {canPoCancel && selectedPoIds.length > 0 && (
        <div className="flex flex-wrap justify-end gap-2 mb-4">
          <Button type="button" variant="outline" size="sm" onClick={() => setSelectedPoIds([])}>
            Clear PO selection ({selectedPoIds.length})
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            className="gap-1"
            onClick={() => setConfirmDeletePOs(true)}
            disabled={deletePOMutation.isPending}
          >
            <Trash2 className="w-3.5 h-3.5" /> Delete selected POs ({selectedPoIds.length})
          </Button>
        </div>
      )}

      {Object.keys(vendorGroups).length === 0 ? (
        <div className="text-center py-16 text-muted-foreground"><Package className="w-12 h-12 mx-auto mb-3 opacity-30" /><p>No vendor jobs yet.</p></div>
      ) : (
        <div className="space-y-5">
          {Object.entries(vendorGroups).map(([vid, group]) => {
            const noPOItems = group.items.filter(i => !i.vendor_order_id);
            const selected = getSelected(vid);
            const vendorPOs = getPOForVendor(vid);
            return (
              <Card key={vid} className="border shadow-sm">
                <CardHeader className="pb-2 cursor-pointer" onClick={() => toggleVendor(vid)}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {isExpanded(vid) ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                      <CardTitle className="text-base">{group.vendor_name}</CardTitle>
                      <Badge variant="secondary">{group.items.length} items</Badge>
                      {noPOItems.length > 0 && <Badge className="bg-amber-100 text-amber-700 border-amber-200">{noPOItems.length} pending PO</Badge>}
                    </div>
                    <div className="flex gap-2" onClick={e => e.stopPropagation()}>
                      {selected.length > 0 && (
                        <>
                          {canEditVendorJobs && (
                          <Button size="sm" variant="outline" className="gap-1 h-8 text-xs" onClick={() => setReassignDialog({ itemIds: selected, currentVendor: group.vendor_name })}>Reassign</Button>
                          )}
                          {canPoIssue && (
                          <Button size="sm" className="gap-1 h-8 text-xs" onClick={() => generatePOMutation.mutate({ vendorId: vid, vendorName: group.vendor_name, itemIds: selected })}><FilePlus className="w-3.5 h-3.5" /> Generate PO</Button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </CardHeader>
                {isExpanded(vid) && (
                  <CardContent className="pt-0 space-y-4">
                    {noPOItems.length > 0 && (
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-xs font-semibold text-amber-600 uppercase tracking-wide">Pending PO</span>
                          {canSelectPendingItems && (
                            <>
                              <Checkbox checked={selected.length === noPOItems.length && noPOItems.length > 0} onCheckedChange={() => toggleAllForVendor(vid, group.items)} />
                              <span className="text-xs text-muted-foreground">Select all</span>
                            </>
                          )}
                        </div>
                        <div className="border rounded-lg overflow-hidden">
                          <table className="w-full text-sm">
                            <thead><tr className="bg-amber-50 border-b text-xs text-muted-foreground">{canSelectPendingItems && <th className="w-8 px-3 py-2"></th>}<th className="text-left px-3 py-2">Bill #</th><th className="text-left px-3 py-2">Item</th><th className="text-left px-3 py-2">Customer</th><th className="text-right px-3 py-2">Qty</th><th className="text-right px-3 py-2">Rate</th><th className="text-right px-3 py-2">Amount</th><th className="text-left px-3 py-2">Status</th></tr></thead>
                            <tbody>
                              {noPOItems.map(item => {
                                const bill = getBill(item.bill_id);
                                return (
                                  <tr key={item.id} className={`border-b last:border-0 hover:bg-muted/30 ${selected.includes(item.id) ? 'bg-primary/5' : ''}`}>
                                    {canSelectPendingItems && (
                                    <td className="px-3 py-2"><Checkbox checked={selected.includes(item.id)} onCheckedChange={() => toggleItem(vid, item.id)} /></td>
                                    )}
                                    <td className="px-3 py-2 font-medium">{item.bill_number}</td>
                                    <td className="px-3 py-2">{item.item_name}</td>
                                    <td className="px-3 py-2 text-muted-foreground">{bill?.customer_name || '-'}</td>
                                    <td className="px-3 py-2 text-right">{item.quantity}</td>
                                    <td className="px-3 py-2 text-right">{fmt(item.vendor_rate || 0)}</td>
                                    <td className="px-3 py-2 text-right font-medium">{fmt(item.vendor_amount || 0)}</td>
                                    <td className="px-3 py-2"><StatusBadge status={item.delivery_status} /></td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                    {vendorPOs.length > 0 && (
                      <div>
                        <span className="text-xs font-semibold text-primary uppercase tracking-wide">Purchase Orders</span>
                        <div className="mt-2 space-y-2">
                          {vendorPOs.map(po => {
                            const poItemList = getPOItems(po.id);
                            return (
                              <div key={po.id} className="border rounded-lg p-3 bg-muted/20 flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 min-w-0">
                                  {canPoCancel && (
                                    <Checkbox
                                      checked={selectedPoIds.includes(po.id)}
                                      onCheckedChange={() => togglePoSelect(po.id)}
                                      onClick={(e) => e.stopPropagation()}
                                    />
                                  )}
                                  <div className="min-w-0">
                                  <span className="font-semibold text-sm">{po.order_number}</span>
                                  <span className="text-xs text-muted-foreground ml-3">{po.order_date} · {poItemList.length} items · {fmt(po.total_amount || 0)}</span>
                                  <StatusBadge status={po.payment_status} className="ml-2" />
                                  </div>
                                </div>
                                <div className="flex gap-1 shrink-0 flex-wrap justify-end">
                                  {canPoCancel && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="gap-1 h-7 text-xs text-amber-800 border-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/40"
                                      disabled={deletePOMutation.isPending}
                                      onClick={() =>
                                        setConfirmCancelPO({ id: po.id, order_number: po.order_number || "" })
                                      }
                                    >
                                      <Undo2 className="w-3.5 h-3.5" /> Cancel PO
                                    </Button>
                                  )}
                                  <Button size="sm" variant="outline" className="gap-1 h-7 text-xs shrink-0" onClick={() => setSelectedPO({ po, items: poItemList })}><Eye className="w-3.5 h-3.5" /> View PO</Button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <PODetailDialog
        data={selectedPO}
        bills={bills}
        vendors={vendors}
        onClose={() => setSelectedPO(null)}
        currentUser={user}
        canCancelPO={canPoCancel}
        cancelPOPending={deletePOMutation.isPending}
        onRequestCancelPO={(po) => {
          setSelectedPO(null);
          setConfirmCancelPO({ id: po.id, order_number: po.order_number || "" });
        }}
        canExportPo={canExportVendorJobs}
        canSendPo={canPoSend}
      />

      <ConfirmModal
        open={!!confirmCancelPO}
        onClose={() => setConfirmCancelPO(null)}
        onConfirm={() => {
          const id = confirmCancelPO?.id;
          setConfirmCancelPO(null);
          if (id) deletePOMutation.mutate([id]);
        }}
        title="Cancel purchase order?"
        description={`Remove ${confirmCancelPO?.order_number || "this PO"} and unlink its line items from the PO? Items stay with the same vendor and return to Pending PO so you can reassign them to another vendor or generate a new PO. Delivery status is not changed.`}
        confirmText="Cancel PO"
        destructive
      />

      <ConfirmModal
        open={confirmDeletePOs}
        onClose={() => setConfirmDeletePOs(false)}
        onConfirm={() => deletePOMutation.mutate([...selectedPoIds])}
        title="Delete purchase orders?"
        description={`Permanently delete ${selectedPoIds.length} PO record(s). Linked line items will be unlinked so you can regenerate POs or reassign vendors.`}
        confirmText="Delete POs"
        destructive
      />

      <Dialog open={!!reassignDialog} onOpenChange={() => setReassignDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Reassign Items to Vendor</DialogTitle></DialogHeader>
          {reassignDialog && (
            <div className="grid gap-4 py-2">
              <p className="text-sm text-muted-foreground">Current: <span className="font-medium">{reassignDialog.currentVendor}</span> · {reassignDialog.itemIds.length} items</p>
              <div>
                <Label>Select New Vendor *</Label>
                <Select onValueChange={v => setReassignDialog({ ...reassignDialog, selectedNewVendorId: v })}><SelectTrigger><SelectValue placeholder="Choose vendor" /></SelectTrigger><SelectContent>{vendorsSorted.map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}</SelectContent></Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setReassignDialog(null)}>Cancel</Button>
            <Button onClick={() => { const vendor = vendors.find(v => v.id === reassignDialog.selectedNewVendorId); if (!vendor) { toast.error("Select a vendor"); return; } reassignMutation.mutate({ itemIds: reassignDialog.itemIds, newVendorId: vendor.id, newVendorName: vendor.name }); setReassignDialog(null); }} disabled={!reassignDialog?.selectedNewVendorId}>Reassign</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PODetailDialog({ data, bills, vendors, onClose, currentUser, canCancelPO, onRequestCancelPO, cancelPOPending, canExportPo, canSendPo }) {
  const [emailDialog, setEmailDialog] = useState(false);
  const [emailPreview, setEmailPreview] = useState(false);
  const [whatsappCompose, setWhatsappCompose] = useState(false);
  const [whatsappDraft, setWhatsappDraft] = useState("");
  const [vendorEmail, setVendorEmail] = useState('');
  const [companySettings, setCompanySettings] = useState({});

  const { data: settings = [] } = useQuery({ queryKey: ['company-settings-po'], queryFn: () => db.CompanySettings.list() });
  const vendor = vendors.find(v => v.id === data?.po?.vendor_id);

  useEffect(() => { if (settings.length > 0) setCompanySettings(settings[0]); }, [settings]);
  useEffect(() => { if (emailDialog && vendor?.email && !vendorEmail) setVendorEmail(vendor.email); }, [emailDialog, vendor]);

  const sendEmailMutation = useMutation({
    mutationFn: async () => {
      if (!vendorEmail) throw new Error("Vendor email is required");
      const { po, items } = data;
      const totalQty = items.reduce((s, i) => s + (i.quantity || 1), 0);
      const totalAmt = items.reduce((s, i) => s + (i.vendor_amount || 0), 0);
      const pdfRows = items.map(item => { const bill = bills.find(b => b.id === item.bill_id); return { bill_number: item.bill_number, customer_name: bill?.customer_name || '-', item_name: item.item_name, category: item.category || '-', quantity: item.quantity, vendor_rate: item.vendor_rate || 0, vendor_amount: item.vendor_amount || 0 }; });
      const pdfBase64 = generatePdfBase64({ title: `Purchase Order ${po.order_number}`, subtitle: `Vendor: ${po.vendor_name} | Date: ${po.order_date}`, columns: [{ header: 'Bill #', key: 'bill_number' }, { header: 'Customer', key: 'customer_name' }, { header: 'Item', key: 'item_name' }, { header: 'Category', key: 'category' }, { header: 'Qty', key: 'quantity' }, { header: 'Rate', key: 'vendor_rate' }, { header: 'Amount', key: 'vendor_amount' }], rows: pdfRows, companySettings, grandTotal: totalAmt });
      const body = `Dear ${po.vendor_name},\n\nWe are pleased to place order for ${totalQty} number of Items, totalling ${formatCurrencyAmount(totalAmt, companySettings)}. Please find attached the Purchase Order.\n\nThanks for your co-operation.\n\nBest Regards,\n${companySettings.company_name || 'COMFORT'}`;
      await sendEmail({ to: vendorEmail, subject: `Purchase Order — ${po.order_number}`, body, fromName: companySettings.email_from_name || companySettings.company_name });
    },
    onSuccess: () => { toast.success("Email sent to vendor"); setEmailDialog(false); setVendorEmail(''); },
    onError: (err) => toast.error(err.message || "Failed to send email")
  });

  if (!data) return null;
  const { po, items } = data;
  const getBill = (billId) => bills.find(b => b.id === billId);
  const totalQty = items.reduce((s, i) => s + (i.quantity || 1), 0);
  const totalAmt = items.reduce((s, i) => s + (i.vendor_amount || 0), 0);
  const curCode = getCurrencyConfig(companySettings).code;

  const defaultWhatsappPoMessage = `Dear ${po.vendor_name},\n\nWe are pleased to place order for ${totalQty} Items, totalling ${formatCurrencyAmount(totalAmt, companySettings)}. Kindly proceed with the work.\n\nBest Regards,\n${companySettings.company_name || 'COMFORT'}`;

  const openWhatsappCompose = () => {
    if (!vendor?.phone?.trim()) {
      toast.error("Vendor phone not available");
      return;
    }
    setWhatsappDraft(defaultWhatsappPoMessage);
    setWhatsappCompose(true);
  };

  const confirmOpenWhatsapp = () => {
    const text = whatsappDraft.trim();
    if (!text) {
      toast.error("Message cannot be empty");
      return;
    }
    const url = buildWhatsappMeUrl(vendor.phone, text);
    if (!url) {
      toast.error("Invalid phone number for WhatsApp");
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
    setWhatsappCompose(false);
  };

  const handleExportPDF = async () => {
    const columns = [{ header: 'Bill #', key: 'bill_number' }, { header: 'Customer', key: 'customer_name' }, { header: 'Item', key: 'item_name' }, { header: 'Category', key: 'category' }, { header: 'Qty', key: 'quantity' }, { header: 'Rate', key: 'vendor_rate' }, { header: 'Amount', key: 'vendor_amount' }];
    const rows = items.map(item => { const bill = getBill(item.bill_id); return { bill_number: item.bill_number, customer_name: bill?.customer_name || '-', item_name: item.item_name, category: item.category, quantity: item.quantity, vendor_rate: item.vendor_rate || 0, vendor_amount: item.vendor_amount || 0 }; });
    await exportPDF({ title: `Purchase Order ${po.order_number}`, dateRange: `Date: ${po.order_date}`, columns, rows, companySettings });
  };

  return (
    <Dialog open={!!data} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Purchase Order — {po.order_number} <StatusBadge status={po.payment_status} /></DialogTitle></DialogHeader>
        <div className="mb-4 text-sm text-muted-foreground">Vendor: <span className="font-medium text-foreground">{po.vendor_name}</span> · Date: {po.order_date}</div>
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="bg-muted/60 text-xs text-muted-foreground border-b"><th className="text-left px-3 py-2.5">Bill #</th><th className="text-left px-3 py-2.5">Customer</th><th className="text-left px-3 py-2.5">Item</th><th className="text-left px-3 py-2.5">Cat</th><th className="text-right px-3 py-2.5">Qty</th><th className="text-right px-3 py-2.5">Rate ({curCode})</th><th className="text-right px-3 py-2.5">Amount ({curCode})</th><th className="text-left px-3 py-2.5">Status</th></tr></thead>
            <tbody>
              {items.map(item => { const bill = getBill(item.bill_id); return (<tr key={item.id} className="border-b last:border-0 hover:bg-muted/20"><td className="px-3 py-2 font-medium">{item.bill_number}</td><td className="px-3 py-2 text-muted-foreground">{bill?.customer_name || '-'}</td><td className="px-3 py-2">{item.item_name}</td><td className="px-3 py-2 text-muted-foreground">{item.category}</td><td className="px-3 py-2 text-right">{item.quantity}</td><td className="px-3 py-2 text-right">{formatCurrencyAmount(item.vendor_rate || 0, companySettings)}</td><td className="px-3 py-2 text-right font-medium">{formatCurrencyAmount(item.vendor_amount || 0, companySettings)}</td><td className="px-3 py-2"><StatusBadge status={item.delivery_status} /></td></tr>); })}
              <tr className="bg-primary/5 font-semibold border-t-2"><td colSpan={4} className="px-3 py-2.5 text-right">Total</td><td className="px-3 py-2.5 text-right">{totalQty}</td><td></td><td className="px-3 py-2.5 text-right">{formatCurrencyAmount(totalAmt, companySettings)}</td><td></td></tr>
            </tbody>
          </table>
        </div>
        <DialogFooter className="flex-col sm:flex-row gap-2 sm:justify-between sm:items-center">
          <div className="flex flex-wrap gap-2 order-2 sm:order-1">
            {canCancelPO && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1 text-amber-800 border-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/40"
                disabled={cancelPOPending}
                onClick={() => onRequestCancelPO?.(po)}
              >
                <Undo2 className="w-4 h-4" /> Cancel PO
              </Button>
            )}
          </div>
          <div className="flex flex-wrap gap-2 justify-end order-1 sm:order-2 w-full sm:w-auto">
            <Button variant="outline" onClick={onClose}>Close</Button>
            {canExportPo && (
            <Button size="sm" variant="outline" className="gap-1" onClick={handleExportPDF}><Download className="w-4 h-4" /> Export PDF</Button>
            )}
            {canSendPo && (
            <>
            <Button size="sm" className="gap-1 bg-blue-600 hover:bg-blue-700" onClick={() => setEmailDialog(true)}><Mail className="w-4 h-4" /> Email</Button>
            <Button size="sm" className="gap-1 bg-green-600 hover:bg-green-700" onClick={openWhatsappCompose}><MessageSquare className="w-4 h-4" /> WhatsApp</Button>
            </>
            )}
          </div>
        </DialogFooter>
        <Dialog open={emailDialog} onOpenChange={setEmailDialog}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Send PO via Email</DialogTitle></DialogHeader>
            <div className="grid gap-4 py-2">
              <div><Label>Vendor Email *</Label><Input value={vendorEmail} onChange={e => setVendorEmail(e.target.value)} placeholder="vendor@example.com" /></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEmailDialog(false)}>Cancel</Button>
              <Button variant="outline" className="gap-1" onClick={() => setEmailPreview(true)} disabled={!vendorEmail}><Eye className="w-4 h-4" /> Preview</Button>
              <Button onClick={() => sendEmailMutation.mutate()} disabled={sendEmailMutation.isPending || !vendorEmail}>Send</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <EmailPreviewDialog open={emailPreview} onClose={() => setEmailPreview(false)} subject={`Purchase Order — ${po.order_number}`} bodyText={`Dear ${po.vendor_name},\n\nWe are pleased to place order for ${totalQty} Items, totalling ${formatCurrencyAmount(totalAmt, companySettings)}.\n\nBest Regards,\n${companySettings.company_name || 'COMFORT'}`} recipient={{ name: po.vendor_name, email: vendorEmail }} />
        <Dialog open={whatsappCompose} onOpenChange={setWhatsappCompose}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>WhatsApp message</DialogTitle>
            </DialogHeader>
            <p className="text-xs text-muted-foreground">
              Edit the message here, then open WhatsApp. You can still change the text in the WhatsApp chat box before sending.
            </p>
            <Textarea
              className="min-h-[180px] font-mono text-sm"
              value={whatsappDraft}
              onChange={(e) => setWhatsappDraft(e.target.value)}
            />
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setWhatsappCompose(false)}>Cancel</Button>
              <Button onClick={confirmOpenWhatsapp}>Open WhatsApp</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}