import React, { useState, useMemo, useEffect, useRef } from "react";
import { db } from "@/services/SupabaseService";
import { useQuery } from "@tanstack/react-query";
import PageHeader from "@/components/shared/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import StatusBadge from "@/components/shared/StatusBadge";
import { format } from "date-fns";
import { getDefaultFYOption, formatPeriodForExport } from "@/lib/financialYear";
import { useFinancialYearRule } from "@/hooks/useFinancialYearRule";
import { useAppCurrency } from "@/hooks/useAppCurrency";
import { getBillSalesmanDisplayName } from "@/lib/billSalesman";
import { sortStringsForDisplay } from "@/lib/utils";

export default function SalesReports() {
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
  const [filterSalesman, setFilterSalesman] = useState("");
  const [filterCustomer, setFilterCustomer] = useState("");
  const [filterLocation, setFilterLocation] = useState("");

  const { data: bills = [] } = useQuery({
    queryKey: ["bills-report"],
    queryFn: () => db.Bill.list("-bill_date", 2000),
  });

  const { data: customers = [] } = useQuery({
    queryKey: ["customers-report"],
    queryFn: () => db.Customer.list("-created_date", 2000),
  });

  const { data: paymentCollections = [] } = useQuery({
    queryKey: ['payments-all', 'sales'],
    queryFn: () => db.PaymentCollection.list("-date", 2000),
  });

  const { data: billItems = [] } = useQuery({
    queryKey: ["bill-items-report"],
    queryFn: () => db.BillItem.list("-created_date", 2000),
  });

  const filtered = useMemo(
    () => bills.filter((b) => b.bill_date >= dateFrom && b.bill_date <= dateTo),
    [bills, dateFrom, dateTo]
  );
  const customerMap = useMemo(
    () => Object.fromEntries(customers.map((c) => [c.id, c])),
    [customers]
  );
  const paymentsByBill = useMemo(() => {
    const m = {};
    paymentCollections.forEach((p) => {
      if (!m[p.bill_id]) m[p.bill_id] = 0;
      m[p.bill_id] += p.amount || 0;
    });
    return m;
  }, [paymentCollections]);
  const itemsByBill = useMemo(() => {
    const m = {};
    billItems.forEach((item) => {
      if (!m[item.bill_id]) m[item.bill_id] = [];
      m[item.bill_id].push(item);
    });
    return m;
  }, [billItems]);

  const { bySalesmanDetailed, byCustomerDetailed, byLocationDetailed } = useMemo(() => {
    const getActualDeliveryDate = (billId) => {
      const items = itemsByBill[billId] || [];
      const deliveredItem = items.find(
        (i) =>
          i.delivery_date &&
          (i.delivery_status === "delivered_unpaid" || i.delivery_status === "delivered_paid")
      );
      return deliveredItem?.delivery_date || "-";
    };

    const bySalesmanDetailed = {};
    const byCustomerDetailed = {};
    const byLocationDetailed = {};

    filtered.forEach((b) => {
      const salesmanName = getBillSalesmanDisplayName(b) || "Unknown";
      if (!bySalesmanDetailed[salesmanName]) bySalesmanDetailed[salesmanName] = [];
      bySalesmanDetailed[salesmanName].push({
        billNumber: b.bill_number,
        customerName: b.customer_name,
        amount: b.total_amount || 0,
        billDate: b.bill_date,
        deliveryDate: getActualDeliveryDate(b.id),
        paymentStatus: b.payment_status,
      });

      const customerName = b.customer_name || "Unknown";
      if (!byCustomerDetailed[customerName]) byCustomerDetailed[customerName] = [];
      byCustomerDetailed[customerName].push({
        billNumber: b.bill_number,
        amount: b.total_amount || 0,
        billDate: b.bill_date,
        deliveryDate: getActualDeliveryDate(b.id),
        salesman: getBillSalesmanDisplayName(b) || "-",
        paymentStatus: b.payment_status,
        paymentCollected: paymentsByBill[b.id] || 0,
      });

      const cust = customerMap[b.customer_id];
      const location = cust?.location || "Unknown";
      if (!byLocationDetailed[location]) byLocationDetailed[location] = [];
      byLocationDetailed[location].push({
        customerName: b.customer_name,
        salesman: getBillSalesmanDisplayName(b) || "-",
        billNumber: b.bill_number,
        billDate: b.bill_date,
        deliveryDate: getActualDeliveryDate(b.id),
        paymentStatus: b.payment_status,
        paymentCollected: paymentsByBill[b.id] || 0,
        amount: b.total_amount || 0,
      });
    });

    return { bySalesmanDetailed, byCustomerDetailed, byLocationDetailed };
  }, [filtered, customerMap, itemsByBill, paymentsByBill]);

  const salesmenOptions = useMemo(
    () => [...Object.keys(bySalesmanDetailed)].filter((n) => n && String(n).trim()).sort((a, b) => a.localeCompare(b)),
    [bySalesmanDetailed]
  );
  const customerOptions = useMemo(
    () => [...Object.keys(byCustomerDetailed)].filter((n) => n && String(n).trim()).sort((a, b) => a.localeCompare(b)),
    [byCustomerDetailed]
  );
  const locationOptions = useMemo(
    () => [...Object.keys(byLocationDetailed)].filter((n) => n && String(n).trim()).sort((a, b) => a.localeCompare(b)),
    [byLocationDetailed]
  );

  const filteredSalesmanEntries = useMemo(
    () =>
      Object.entries(bySalesmanDetailed)
        .filter(([name]) => !filterSalesman || name === filterSalesman)
        .sort(([, a], [, b]) => b.length - a.length),
    [bySalesmanDetailed, filterSalesman]
  );
  const filteredCustomerEntries = useMemo(
    () =>
      Object.entries(byCustomerDetailed)
        .filter(([name]) => !filterCustomer || name === filterCustomer)
        .sort(([, a], [, b]) => b.length - a.length),
    [byCustomerDetailed, filterCustomer]
  );
  const filteredLocationEntries = useMemo(
    () =>
      Object.entries(byLocationDetailed)
        .filter(([loc]) => !filterLocation || loc === filterLocation)
        .sort(([, a], [, b]) => b.length - a.length),
    [byLocationDetailed, filterLocation]
  );

  const FilterBar = ({ children }) => <div className="flex gap-3 mb-4 flex-wrap items-end">{children}</div>;

  const FilterSelect = ({ label, value, onChange, options, placeholder = "All" }) => {
    const clean = sortStringsForDisplay((options || []).filter((o) => o != null && String(o).trim() !== ""));
    return (
    <div className="min-w-[180px]">
      <Label className="text-xs">{label}</Label>
      <Select value={value || "__all__"} onValueChange={(v) => onChange(v === "__all__" ? "" : v)}>
        <SelectTrigger className="h-8 text-xs">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">{placeholder}</SelectItem>
          {clean.map((o) => (
            <SelectItem key={o} value={o}>
              {o}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
    );
  };

  const DetailedTable = ({ data, columns }) => (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b bg-muted/50 text-muted-foreground">
            {columns.map((col) => (
              <th key={col.key} className="text-left px-3 py-2">
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, idx) => (
            <tr key={idx} className="border-b last:border-0 hover:bg-muted/20">
              {columns.map((col) => (
                <td key={col.key} className="px-3 py-2">
                  {col.render ? col.render(row) : row[col.key] || "-"}
                </td>
              ))}
            </tr>
          ))}
          {data.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="text-center py-8 text-muted-foreground">
                No data
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );

  return (
    <div>
      <PageHeader
        title="Sales Reports"
        subtitle="Detailed sales performance analysis"
        permissionResource="reports_sales"
        dateRange={formatPeriodForExport(dateFrom, dateTo, rule)}
        exportData={filtered.map((b) => ({
          "Bill #": b.bill_number,
          "Bill Date": b.bill_date,
          Customer: b.customer_name,
          Salesman: getBillSalesmanDisplayName(b) || "-",
          Amount: b.total_amount || 0,
          "Payment Status": b.payment_status || "-",
        }))}
      />
      <div className="flex gap-3 mb-6 items-end">
        <div>
          <Label className="text-xs">From</Label>
          <Input type="date" className="h-9 w-40" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">To</Label>
          <Input type="date" className="h-9 w-40" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
        <div className="text-sm text-muted-foreground">
          {filtered.length} bills · {fmt(filtered.reduce((s, b) => s + (b.total_amount || 0), 0))}
        </div>
      </div>
      <Tabs defaultValue="salesman">
        <TabsList className="mb-4">
          <TabsTrigger value="salesman">Salesman-wise</TabsTrigger>
          <TabsTrigger value="customer">Customer-wise</TabsTrigger>
          <TabsTrigger value="location">Area/Locality-wise</TabsTrigger>
        </TabsList>
        <TabsContent value="salesman">
          <FilterBar>
            <FilterSelect
              label="Salesman"
              value={filterSalesman}
              onChange={setFilterSalesman}
              options={salesmenOptions}
              placeholder="All salesmen"
            />
          </FilterBar>
          {filteredSalesmanEntries.map(([name, billRows]) => (
              <Card key={name} className="mb-4 border-0 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-sm">
                    {name} - {billRows.length} bills ·{" "}
                    {fmt(billRows.reduce((s, br) => s + br.amount, 0))}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <DetailedTable
                    data={billRows}
                    columns={[
                      { key: "billNumber", header: "Bill #" },
                      { key: "customerName", header: "Customer" },
                      {
                        key: "amount",
                        header: "Amount",
                        render: (r) => fmt(r.amount),
                      },
                      { key: "billDate", header: "Pickup Date" },
                      { key: "deliveryDate", header: "Delivery" },
                      {
                        key: "paymentStatus",
                        header: "Payment",
                        render: (r) => <StatusBadge status={r.paymentStatus} />,
                      },
                    ]}
                  />
                </CardContent>
              </Card>
            ))}
          {filteredSalesmanEntries.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">No data for this filter</div>
          )}
        </TabsContent>
        <TabsContent value="customer">
          <FilterBar>
            <FilterSelect
              label="Customer"
              value={filterCustomer}
              onChange={setFilterCustomer}
              options={customerOptions}
              placeholder="All customers"
            />
          </FilterBar>
          {filteredCustomerEntries.map(([name, billRows]) => (
              <Card key={name} className="mb-4 border-0 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-sm">
                    {name} - {billRows.length} bills ·{" "}
                    {fmt(billRows.reduce((s, br) => s + br.amount, 0))}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <DetailedTable
                    data={billRows}
                    columns={[
                      { key: "billNumber", header: "Bill #" },
                      { key: "salesman", header: "Salesman" },
                      {
                        key: "amount",
                        header: "Amount",
                        render: (r) => fmt(r.amount),
                      },
                      { key: "billDate", header: "Pickup" },
                      { key: "deliveryDate", header: "Delivery" },
                      {
                        key: "paymentCollected",
                        header: "Collected",
                        render: (r) => fmt(r.paymentCollected || 0),
                      },
                      {
                        key: "paymentStatus",
                        header: "Payment",
                        render: (r) => <StatusBadge status={r.paymentStatus} />,
                      },
                    ]}
                  />
                </CardContent>
              </Card>
            ))}
          {filteredCustomerEntries.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">No data for this filter</div>
          )}
        </TabsContent>
        <TabsContent value="location">
          <FilterBar>
            <FilterSelect
              label="Area/Locality"
              value={filterLocation}
              onChange={setFilterLocation}
              options={locationOptions}
              placeholder="All areas / localities"
            />
          </FilterBar>
          {filteredLocationEntries.map(([location, billRows]) => (
              <Card key={location} className="mb-4 border-0 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-sm">
                    {location} - {billRows.length} bills ·{" "}
                    {fmt(billRows.reduce((s, br) => s + br.amount, 0))}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <DetailedTable
                    data={billRows}
                    columns={[
                      { key: "customerName", header: "Customer" },
                      { key: "salesman", header: "Salesman" },
                      { key: "billNumber", header: "Bill #" },
                      { key: "billDate", header: "Pickup" },
                      { key: "deliveryDate", header: "Delivery" },
                      {
                        key: "paymentCollected",
                        header: "Collected",
                        render: (r) => fmt(r.paymentCollected || 0),
                      },
                      {
                        key: "paymentStatus",
                        header: "Payment",
                        render: (r) => <StatusBadge status={r.paymentStatus} />,
                      },
                    ]}
                  />
                </CardContent>
              </Card>
            ))}
          {filteredLocationEntries.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">No data for this filter</div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
