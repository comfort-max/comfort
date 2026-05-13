import React, { useState, useMemo, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { usePaymentMethodsQuery } from "@/hooks/usePaymentMethodsQuery";
import { supabase } from "@/lib/supabaseClient";
import { db } from "@/services/SupabaseService";
import PageHeader from "@/components/shared/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { format } from "date-fns";
import { getDefaultFYOption, formatPeriodForExport } from "@/lib/financialYear";
import { useFinancialYearRule } from "@/hooks/useFinancialYearRule";
import { useAppCurrency } from "@/hooks/useAppCurrency";
import { resolvePaymentBill, resolvePaymentSalesmanName, getBillSalesmanDisplayName, embeddedBillFromPaymentJoin, normalizePaymentBillNumber, foldBillsByBillNumber } from "@/lib/billSalesman";
import { buildPaymentMethodClassifier } from "@/lib/paymentMethodChannel";
import { sortStringsForDisplay, localeDisplayCompare } from "@/lib/utils";

export default function PaymentReports() {
  const { format: fmt } = useAppCurrency();
  const { rule, isLoading: fyLoading } = useFinancialYearRule();
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const fyRuleLoadedKey = useRef("");

  useEffect(() => {
    if (fyLoading) return;
    const k = `${rule.startMonth}-${rule.startDay}`;
    if (fyRuleLoadedKey.current === k) return;
    fyRuleLoadedKey.current = k;
    const def = getDefaultFYOption(new Date(), rule);
    const today = format(new Date(), "yyyy-MM-dd");
    setDateFrom(def.start);
    setDateTo(today <= def.end ? today : def.end);
  }, [fyLoading, rule]);
  const [salesmanFilter, setSalesmanFilter] = useState('');
  const [customerFilterCustomer, setCustomerFilterCustomer] = useState('');
  const [customerFilterCash, setCustomerFilterCash] = useState('');
  const [collectedByFilterCash, setCollectedByFilterCash] = useState('');
  const [customerFilterBank, setCustomerFilterBank] = useState('');
  const [collectedByFilterBank, setCollectedByFilterBank] = useState('');
  const [salesmanFilterCash, setSalesmanFilterCash] = useState('');
  const [salesmanFilterBank, setSalesmanFilterBank] = useState('');

  const { data: payments = [] } = useQuery({
    queryKey: ['payments-all', 'reports'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payment_collections')
        .select(
          '*, bills ( id, pickup_employee_id, pickup_employee_name, salesman_id, salesman_name )'
        )
        .order('date', { ascending: false })
        .limit(2000);
      if (!error && data != null) return data;
      return db.PaymentCollection.list('-date', 2000);
    },
  });

  const { data: employees = [] } = useQuery({
    queryKey: ['employees-for-payment-reports'],
    queryFn: () => db.Employee.list('-name', 2000),
  });

  const employeeById = useMemo(() => {
    const m = {};
    for (const e of employees) {
      if (e?.id == null) continue;
      m[String(e.id)] = e;
      m[e.id] = e;
    }
    return m;
  }, [employees]);

  const billIdsNeedingFetch = useMemo(
    () => [...new Set(
      payments
        .filter((p) => {
          if (!p.bill_id) return false;
          if (String(p.salesman_name ?? "").trim()) return false;
          const embedded = embeddedBillFromPaymentJoin(p);
          const label = getBillSalesmanDisplayName(embedded, employeeById);
          return !label;
        })
        .map((p) => p.bill_id)
    )].sort(),
    [payments, employeeById]
  );

  /** Bill #s on rows without denormalized salesman — load `bills` by number (works when `bill_id` is missing or wrong). */
  const billNumbersToResolve = useMemo(() => {
    const s = new Set();
    for (const p of payments) {
      if (String(p.salesman_name ?? "").trim()) continue;
      const bn = normalizePaymentBillNumber(p.bill_number);
      if (bn) s.add(bn);
    }
    return [...s].sort();
  }, [payments]);

  const billNumbersFetchKey = useMemo(() => {
    if (!billNumbersToResolve.length) return "0";
    let h = 0;
    for (const n of billNumbersToResolve) {
      for (let i = 0; i < n.length; i++) h = ((h << 5) - h) + n.charCodeAt(i) | 0;
    }
    return `${billNumbersToResolve.length}:${h}`;
  }, [billNumbersToResolve]);

  const billIdsFetchKey = useMemo(() => {
    if (!billIdsNeedingFetch.length) return '0';
    let h = 0;
    for (const id of billIdsNeedingFetch) {
      const s = String(id);
      for (let i = 0; i < s.length; i++) h = ((h << 5) - h) + s.charCodeAt(i) | 0;
    }
    return `${billIdsNeedingFetch.length}:${h}`;
  }, [billIdsNeedingFetch]);

  const { data: billsFetched = [] } = useQuery({
    queryKey: ['bills-for-payment-reports', billIdsFetchKey],
    queryFn: async () => {
      if (!billIdsNeedingFetch.length) return [];
      const chunkSize = 25;
      const rows = [];
      for (let i = 0; i < billIdsNeedingFetch.length; i += chunkSize) {
        const slice = billIdsNeedingFetch.slice(i, i + chunkSize);
        let { data, error } = await supabase.from('bills').select('*').in('id', slice);
        if (error && /schema cache|does not exist|relation/i.test(String(error.message || ''))) {
          ({ data, error } = await supabase.from('bill').select('*').in('id', slice));
        }
        if (error) throw error;
        if (data?.length) rows.push(...data);
      }
      return rows;
    },
  });

  const { data: billsByNumberRows = [] } = useQuery({
    queryKey: ['bills-by-number-payment-reports', billNumbersFetchKey],
    enabled: billNumbersToResolve.length > 0,
    queryFn: async () => {
      const chunkSize = 40;
      const rows = [];
      for (let i = 0; i < billNumbersToResolve.length; i += chunkSize) {
        const slice = billNumbersToResolve.slice(i, i + chunkSize);
        let { data, error } = await supabase.from('bills').select('*').in('bill_number', slice);
        if (error && /schema cache|does not exist|relation/i.test(String(error.message || ''))) {
          ({ data, error } = await supabase.from('bill').select('*').in('bill_number', slice));
        }
        if (error) throw error;
        if (data?.length) rows.push(...data);
      }
      return rows;
    },
  });

  const { data: paymentMethods } = usePaymentMethodsQuery();
  const paymentMethodsList = paymentMethods ?? [];

  const filtered = useMemo(() => payments.filter(p => p.date >= dateFrom && p.date <= dateTo), [payments, dateFrom, dateTo]);
  const billMap = useMemo(() => {
    const m = {};
    for (const b of billsFetched) {
      m[b.id] = b;
      m[String(b.id)] = b;
    }
    return m;
  }, [billsFetched]);

  const billByNumberMap = useMemo(() => foldBillsByBillNumber(billsByNumberRows), [billsByNumberRows]);

  const paymentChannel = useMemo(() => buildPaymentMethodClassifier(paymentMethodsList), [paymentMethodsList]);

  const bySalesmanDetails = useMemo(() => {
    const map = {};
    filtered.forEach(p => {
      const bill = resolvePaymentBill(p, billMap, billByNumberMap);
      const raw = resolvePaymentSalesmanName(p, bill, employeeById);
      const salesman = (raw && String(raw).trim()) ? String(raw).trim() : 'Unknown';
      if (!map[salesman]) map[salesman] = [];
      map[salesman].push({ billNumber: p.bill_number, customer: p.customer_name, amount: p.amount || 0, method: p.method, date: p.date, collectedBy: p.collected_by_name || '-' });
    });
    return map;
  }, [filtered, billMap, billByNumberMap, employeeById]);

  const allSalesmen = useMemo(
    () => [...Object.keys(bySalesmanDetails)].sort((a, b) => a.localeCompare(b)),
    [bySalesmanDetails]
  );

  const byCustomerDetails = useMemo(() => {
    const map = {};
    filtered.forEach(p => {
      const customer = p.customer_name || 'Unknown';
      if (!map[customer]) map[customer] = [];
      map[customer].push({ billNumber: p.bill_number, amount: p.amount || 0, date: p.date, collectedBy: p.collected_by_name || '-', method: p.method });
    });
    return map;
  }, [filtered]);

  const byCashDetails = useMemo(() => filtered.filter(p => paymentChannel.isCash(p.method)).map(p => {
    const bill = resolvePaymentBill(p, billMap, billByNumberMap);
    const n = resolvePaymentSalesmanName(p, bill, employeeById);
    return {
      billNumber: p.bill_number,
      customer: p.customer_name,
      salesman: (n && String(n).trim()) ? String(n).trim() : 'Unknown',
      date: p.date,
      collectedBy: p.collected_by_name || '-',
      amount: p.amount || 0,
    };
  }), [filtered, billMap, billByNumberMap, paymentChannel, employeeById]);

  const byBankDetails = useMemo(() => filtered.filter(p => paymentChannel.isBank(p.method)).map(p => {
    const bill = resolvePaymentBill(p, billMap, billByNumberMap);
    const n = resolvePaymentSalesmanName(p, bill, employeeById);
    return {
      billNumber: p.bill_number,
      customer: p.customer_name,
      salesman: (n && String(n).trim()) ? String(n).trim() : 'Unknown',
      date: p.date,
      collectedBy: p.collected_by_name || '-',
      method: p.method,
      amount: p.amount || 0,
    };
  }), [filtered, billMap, billByNumberMap, paymentChannel, employeeById]);

  const cashSalesmanOptions = useMemo(
    () => [...new Set(byCashDetails.map(r => r.salesman))].sort((a, b) => a.localeCompare(b)),
    [byCashDetails]
  );
  const bankSalesmanOptions = useMemo(
    () => [...new Set(byBankDetails.map(r => r.salesman))].sort((a, b) => a.localeCompare(b)),
    [byBankDetails]
  );

  const cashCustomerOptions = useMemo(
    () => [...new Set(byCashDetails.map(r => r.customer).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [byCashDetails]
  );
  const bankCustomerOptions = useMemo(
    () => [...new Set(byBankDetails.map(r => r.customer).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [byBankDetails]
  );
  const cashCollectedOptions = useMemo(
    () => [...new Set(byCashDetails.map(r => r.collectedBy).filter(x => x && x !== '-'))].sort(localeDisplayCompare),
    [byCashDetails]
  );
  const bankCollectedOptions = useMemo(
    () => [...new Set(byBankDetails.map(r => r.collectedBy).filter(x => x && x !== '-'))].sort(localeDisplayCompare),
    [byBankDetails]
  );
  const customerWiseDropdownOptions = useMemo(
    () => [...Object.keys(byCustomerDetails)].sort(localeDisplayCompare),
    [byCustomerDetails]
  );

  const filteredSalesmanEntries = useMemo(() =>
    Object.entries(bySalesmanDetails).filter(([name]) => !salesmanFilter || name === salesmanFilter).sort(([, a], [, b]) => b.length - a.length),
    [bySalesmanDetails, salesmanFilter]);

  const filteredCustomerEntries = useMemo(() =>
    Object.entries(byCustomerDetails).filter(([name]) => !customerFilterCustomer || name === customerFilterCustomer).sort(([, a], [, b]) => b.length - a.length),
    [byCustomerDetails, customerFilterCustomer]);

  const filteredCash = useMemo(() => byCashDetails.filter(r =>
    (!customerFilterCash || r.customer === customerFilterCash)
    && (!collectedByFilterCash || r.collectedBy === collectedByFilterCash)
    && (!salesmanFilterCash || r.salesman === salesmanFilterCash)
  ), [byCashDetails, customerFilterCash, collectedByFilterCash, salesmanFilterCash]);

  const filteredBank = useMemo(() => byBankDetails.filter(r =>
    (!customerFilterBank || r.customer === customerFilterBank)
    && (!collectedByFilterBank || r.collectedBy === collectedByFilterBank)
    && (!salesmanFilterBank || r.salesman === salesmanFilterBank)
  ), [byBankDetails, customerFilterBank, collectedByFilterBank, salesmanFilterBank]);

  const DetailedTable = ({ data, columns }) => (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead><tr className="border-b bg-muted/50 text-muted-foreground">
          {columns.map(col => <th key={col.key} className="text-left px-3 py-2">{col.header}</th>)}
        </tr></thead>
        <tbody>
          {data.map((row, idx) => (
            <tr key={idx} className="border-b last:border-0 hover:bg-muted/20">
              {columns.map(col => <td key={col.key} className="px-3 py-2">{col.render ? col.render(row) : row[col.key] || '-'}</td>)}
            </tr>
          ))}
          {data.length === 0 && <tr><td colSpan={columns.length} className="text-center py-8 text-muted-foreground">No data</td></tr>}
        </tbody>
      </table>
    </div>
  );

  const FilterBar = ({ children }) => <div className="flex gap-3 mb-4 flex-wrap items-end">{children}</div>;

  const FilterSelect = ({ label, value, onChange, options, placeholder = "All" }) => {
    const clean = sortStringsForDisplay((options || []).filter(o => o != null && String(o).trim() !== ''));
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
      <PageHeader title="Payment Reports" subtitle="Detailed payment collection analysis"
        permissionResource="reports_payments"
        dateRange={formatPeriodForExport(dateFrom, dateTo, rule)}
        exportData={filtered.map(p => ({
          Date: p.date,
          'Bill #': p.bill_number,
          Customer: p.customer_name,
          Salesman: resolvePaymentSalesmanName(p, resolvePaymentBill(p, billMap, billByNumberMap), employeeById) || 'Unknown',
          'Collected By': p.collected_by_name || '-',
          Method: p.method,
          Amount: p.amount || 0,
        }))} />

      <div className="flex gap-3 mb-6 items-end">
        <div><Label className="text-xs">From</Label><Input type="date" className="h-9 w-40" value={dateFrom} onChange={e => setDateFrom(e.target.value)} /></div>
        <div><Label className="text-xs">To</Label><Input type="date" className="h-9 w-40" value={dateTo} onChange={e => setDateTo(e.target.value)} /></div>
        <div className="text-sm text-muted-foreground">{filtered.length} collections · {fmt(filtered.reduce((s, p) => s + (p.amount || 0), 0))}</div>
      </div>

      <Tabs defaultValue="salesman">
        <TabsList className="mb-4">
          <TabsTrigger value="salesman">Salesman-wise</TabsTrigger>
          <TabsTrigger value="customer">Customer-wise</TabsTrigger>
          <TabsTrigger value="cash">Cash</TabsTrigger>
          <TabsTrigger value="bank">Bank</TabsTrigger>
        </TabsList>

        <TabsContent value="salesman">
          <FilterBar><FilterSelect label="Salesman" value={salesmanFilter} onChange={setSalesmanFilter} options={allSalesmen} placeholder="All Salesmen" /></FilterBar>
          {filteredSalesmanEntries.map(([name, pmts]) => (
            <Card key={name} className="mb-4 border-0 shadow-sm">
              <CardHeader><CardTitle className="text-sm">{name} — {pmts.length} collections · {fmt(pmts.reduce((s, p) => s + p.amount, 0))}</CardTitle></CardHeader>
              <CardContent><DetailedTable data={pmts} columns={[
                { key: 'billNumber', header: 'Bill #' }, { key: 'customer', header: 'Customer' },
                { key: 'amount', header: 'Amount', render: r => fmt(r.amount) },
                { key: 'date', header: 'Date' }, { key: 'method', header: 'Method' }, { key: 'collectedBy', header: 'Collected By' }
              ]} /></CardContent>
            </Card>
          ))}
          {filteredSalesmanEntries.length === 0 && <div className="text-center py-12 text-muted-foreground">No data</div>}
        </TabsContent>

        <TabsContent value="customer">
          <FilterBar><FilterSelect label="Customer" value={customerFilterCustomer} onChange={setCustomerFilterCustomer} options={customerWiseDropdownOptions} placeholder="All Customers" /></FilterBar>
          {filteredCustomerEntries.map(([name, pmts]) => (
            <Card key={name} className="mb-4 border-0 shadow-sm">
              <CardHeader><CardTitle className="text-sm">{name} — {pmts.length} collections · {fmt(pmts.reduce((s, p) => s + p.amount, 0))}</CardTitle></CardHeader>
              <CardContent><DetailedTable data={pmts} columns={[
                { key: 'billNumber', header: 'Bill #' },
                { key: 'amount', header: 'Amount', render: r => fmt(r.amount) },
                { key: 'date', header: 'Date' }, { key: 'collectedBy', header: 'Collected By' }, { key: 'method', header: 'Method' }
              ]} /></CardContent>
            </Card>
          ))}
          {filteredCustomerEntries.length === 0 && <div className="text-center py-12 text-muted-foreground">No data</div>}
        </TabsContent>

        <TabsContent value="cash">
          <FilterBar>
            <FilterSelect label="Customer" value={customerFilterCash} onChange={setCustomerFilterCash} options={cashCustomerOptions} placeholder="All Customers" />
            <FilterSelect label="Collected By" value={collectedByFilterCash} onChange={setCollectedByFilterCash} options={cashCollectedOptions} placeholder="All" />
            <FilterSelect label="Salesman" value={salesmanFilterCash} onChange={setSalesmanFilterCash} options={cashSalesmanOptions} placeholder="All Salesmen" />
          </FilterBar>
          <Card className="border-0 shadow-sm">
            <CardHeader><CardTitle className="text-sm">Cash Collections — {filteredCash.length} · {fmt(filteredCash.reduce((s, p) => s + p.amount, 0))}</CardTitle></CardHeader>
            <CardContent><DetailedTable data={filteredCash} columns={[
              { key: 'billNumber', header: 'Bill #' }, { key: 'customer', header: 'Customer' },
              { key: 'salesman', header: 'Salesman' },
              { key: 'amount', header: 'Amount', render: r => fmt(r.amount) },
              { key: 'date', header: 'Date' }, { key: 'collectedBy', header: 'Collected By' }
            ]} /></CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="bank">
          {/* "Bank" tab — covers Bank Transfer, Cheque, UPI and any future bank-type methods from Company Settings */}
          <FilterBar>
            <FilterSelect label="Customer" value={customerFilterBank} onChange={setCustomerFilterBank} options={bankCustomerOptions} placeholder="All Customers" />
            <FilterSelect label="Collected By" value={collectedByFilterBank} onChange={setCollectedByFilterBank} options={bankCollectedOptions} placeholder="All" />
            <FilterSelect label="Salesman" value={salesmanFilterBank} onChange={setSalesmanFilterBank} options={bankSalesmanOptions} placeholder="All Salesmen" />
          </FilterBar>
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="text-sm">
                Bank collections — {filteredBank.length} · {fmt(filteredBank.reduce((s, p) => s + p.amount, 0))}
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  ({paymentChannel.bankLabelsPreview.length
                    ? paymentChannel.bankLabelsPreview.join(', ')
                    : 'bank-type methods'})
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent><DetailedTable data={filteredBank} columns={[
              { key: 'billNumber', header: 'Bill #' }, { key: 'customer', header: 'Customer' },
              { key: 'salesman', header: 'Salesman' },
              { key: 'amount', header: 'Amount', render: r => fmt(r.amount) },
              { key: 'date', header: 'Date' }, { key: 'collectedBy', header: 'Collected By' },
              { key: 'method', header: 'Method' }
            ]} /></CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
