import React, { useState, useMemo, useEffect } from "react";
import { db } from "@/services/SupabaseService";
import { useQuery } from "@tanstack/react-query";
import PageHeader from "@/components/shared/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import { formatPeriodForExport } from "@/lib/financialYear";
import { useFinancialYearRule } from "@/hooks/useFinancialYearRule";
import { useAppCurrency } from "@/hooks/useAppCurrency";
import { sortStringsForDisplay } from "@/lib/utils";
import { usePermissions } from "@/hooks/usePermissions";

export default function VendorVolumeReport() {
  const { rule } = useFinancialYearRule();
  const { format: fmt, code: curCode } = useAppCurrency();
  const { can } = usePermissions();
  const canMarginDetail = can("reports_vendor_volume", "margin_detail");
  const [dateFrom, setDateFrom] = useState(format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), 'yyyy-MM-dd'));
  const [dateTo, setDateTo] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [vendorFilter, setVendorFilter] = useState('all');
  const [tab, setTab] = useState('with-margin');

  useEffect(() => {
    if (!canMarginDetail && tab === 'with-margin') setTab('summary');
  }, [canMarginDetail, tab]);

  const { data: billItems = [] } = useQuery({ queryKey: ['bill-items-vv'], queryFn: () => db.BillItem.list('-created_date', 5000) });
  const { data: bills = [] } = useQuery({ queryKey: ['bills-vv'], queryFn: () => db.Bill.list('-created_date', 2000) });
  const { data: vendorBillings = [] } = useQuery({ queryKey: ['vendor-billings-vv'], queryFn: () => db.VendorBilling.list('-date', 2000) });

  const filteredBills = bills.filter(b => b.bill_date >= dateFrom && b.bill_date <= dateTo);
  const filteredBillIds = new Set(filteredBills.map(b => b.id));

  const byVendor = useMemo(() => {
    const map = {};
    billItems.filter(i => i.vendor_id && filteredBillIds.has(i.bill_id)).forEach(i => {
      const n = i.vendor_name || 'Unknown';
      if (!map[n]) map[n] = { items: 0, vendorAmount: 0, customerAmount: 0, paidAmount: 0, billSet: new Set() };
      map[n].items += i.quantity || 0;
      map[n].vendorAmount += i.vendor_amount || 0;
      map[n].customerAmount += i.amount || 0;
      map[n].billSet.add(i.bill_id);
    });
    vendorBillings.filter(vb => vb.date >= dateFrom && vb.date <= dateTo && (vb.payment_status === 'paid' || vb.payment_status === 'overpaid')).forEach(vb => {
      const n = vb.vendor_name || 'Unknown';
      if (!map[n]) map[n] = { items: 0, vendorAmount: 0, customerAmount: 0, paidAmount: 0, billSet: new Set() };
      map[n].paidAmount += vb.amount_paid || 0;
    });
    return Object.fromEntries(Object.entries(map).map(([k, v]) => [k, { ...v, bills: v.billSet.size }]));
  }, [billItems, filteredBillIds, vendorBillings, dateFrom, dateTo]);

  const filtered = useMemo(() => {
    let result = Object.entries(byVendor);
    if (vendorFilter !== 'all') result = result.filter(([name]) => name === vendorFilter);
    return result.sort(([,a],[,b]) => b.vendorAmount - a.vendorAmount);
  }, [byVendor, vendorFilter]);

  const vendorNamesAlphabetical = useMemo(() => sortStringsForDisplay(Object.keys(byVendor)), [byVendor]);

  const exportData = filtered.map(([name, d]) => ({
    Vendor: name, Items: d.items, Bills: d.bills,
    ...(canMarginDetail ? { [`Vendor Cost (${curCode})`]: d.vendorAmount, [`Customer Value (${curCode})`]: d.customerAmount, [`Margin (${curCode})`]: d.customerAmount - d.vendorAmount } : {})
  }));

  return (
    <div>
      <PageHeader title="Vendor Business Volume" subtitle="Volume of business with each vendor" permissionResource="reports_vendor_volume" dateRange={formatPeriodForExport(dateFrom, dateTo, rule)} exportData={exportData} />
      <div className="flex gap-3 mb-4 items-end flex-wrap">
        <div><Label className="text-xs">From Date</Label><Input type="date" className="h-9 w-40" value={dateFrom} onChange={e => setDateFrom(e.target.value)} /></div>
        <div><Label className="text-xs">To Date</Label><Input type="date" className="h-9 w-40" value={dateTo} onChange={e => setDateTo(e.target.value)} /></div>
        <Select value={vendorFilter} onValueChange={setVendorFilter}>
          <SelectTrigger className="w-48 h-9"><SelectValue placeholder="All Vendors" /></SelectTrigger>
          <SelectContent><SelectItem value="all">All Vendors</SelectItem>{vendorNamesAlphabetical.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      {canMarginDetail && <Tabs value={tab} onValueChange={setTab} className="mb-4"><TabsList><TabsTrigger value="with-margin">With Margin (Admin)</TabsTrigger><TabsTrigger value="summary">Summary</TabsTrigger></TabsList></Tabs>}

      <Card className="border-0 shadow-sm">
        <CardContent className="pt-4">
          <table className="w-full text-sm">
            <thead><tr className="border-b text-xs text-muted-foreground">
              <th className="text-left py-2">Vendor</th><th className="text-right py-2">Items</th><th className="text-right py-2">Bills</th>
              {canMarginDetail && tab === 'with-margin' && (<><th className="text-right py-2">Vendor Cost ({curCode})</th><th className="text-right py-2">Customer Value ({curCode})</th><th className="text-right py-2">Margin ({curCode})</th></>)}
              {tab === 'summary' && <th className="text-right py-2">Paid to Vendor ({curCode})</th>}
            </tr></thead>
            <tbody>
              {filtered.map(([name, d]) => (
                <tr key={name} className="border-b last:border-0">
                  <td className="py-2">{name}</td>
                  <td className="py-2 text-right">{d.items}</td>
                  <td className="py-2 text-right">{d.bills}</td>
                  {canMarginDetail && tab === 'with-margin' && (<><td className="py-2 text-right">{fmt(d.vendorAmount)}</td><td className="py-2 text-right">{fmt(d.customerAmount)}</td><td className="py-2 text-right font-medium text-emerald-600">{fmt(d.customerAmount - d.vendorAmount)}</td></>)}
                  {tab === 'summary' && <td className="py-2 text-right font-medium text-blue-600">{fmt(d.paidAmount || 0)}</td>}
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={canMarginDetail && tab === 'with-margin' ? 6 : 4} className="text-center py-8 text-muted-foreground">No data</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}