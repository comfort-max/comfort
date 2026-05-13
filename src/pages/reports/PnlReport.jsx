import React, { useEffect, useMemo, useRef, useState } from "react";
import { db } from "@/services/SupabaseService";
import { useQuery } from "@tanstack/react-query";
import PageHeader from "@/components/shared/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TrendingUp } from "lucide-react";
import {
  getDefaultFYOption,
  listFinancialYears,
  getFYBounds,
  getFYStartYearForDate,
  formatPeriodForExport,
  monthLabelsBetweenDates,
} from "@/lib/financialYear";
import { useFinancialYearRule } from "@/hooks/useFinancialYearRule";
import { useAppCurrency } from "@/hooks/useAppCurrency";
import { localeDisplayCompare } from "@/lib/utils";

export default function PnlReport() {
  const { format: fmt, code: curCode } = useAppCurrency();
  const { rule, isLoading: fyLoading } = useFinancialYearRule();
  const [periodMode, setPeriodMode] = useState("financial-year");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const fyRuleLoadedKey = useRef("");

  useEffect(() => {
    if (fyLoading) return;
    const k = `${rule.startMonth}-${rule.startDay}`;
    if (fyRuleLoadedKey.current === k) return;
    fyRuleLoadedKey.current = k;
    const def = getDefaultFYOption(new Date(), rule);
    setDateFrom(def.start);
    setDateTo(def.end);
  }, [fyLoading, rule]);

  const centerFy = getFYStartYearForDate(new Date(), rule);
  const fyOptions = useMemo(
    () => [...listFinancialYears(centerFy, rule, 5, 2)].sort((a, b) => localeDisplayCompare(a.label, b.label)),
    [centerFy, rule]
  );

  const applyFyPreset = (fyStartYearStr) => {
    const b = getFYBounds(Number(fyStartYearStr), rule);
    setDateFrom(b.start);
    setDateTo(b.end);
  };

  const { data: bills = [] } = useQuery({ queryKey: ["bills-pnl"], queryFn: () => db.Bill.list("-bill_date", 5000) });
  const { data: expenses = [] } = useQuery({ queryKey: ["expenses-pnl"], queryFn: () => db.Expense.list("-date", 5000) });
  const { data: payments = [] } = useQuery({ queryKey: ["payments-all", "pnl"], queryFn: () => db.PaymentCollection.list("-date", 5000) });

  const fyBills = useMemo(
    () => bills.filter((b) => b.bill_date >= dateFrom && b.bill_date <= dateTo),
    [bills, dateFrom, dateTo]
  );
  const fyExpenses = useMemo(
    () => expenses.filter((e) => e.date >= dateFrom && e.date <= dateTo),
    [expenses, dateFrom, dateTo]
  );
  const fyPayments = useMemo(
    () => payments.filter((p) => p.date >= dateFrom && p.date <= dateTo),
    [payments, dateFrom, dateTo]
  );

  const totalSales = fyBills.reduce((s, b) => s + (b.total_amount || 0), 0);
  const totalExpenses = fyExpenses.reduce((s, e) => s + (e.amount || 0), 0);
  const totalCollections = fyPayments.reduce((s, p) => s + (p.amount || 0), 0);
  const cashCollections = fyPayments.filter((p) => String(p.method || "").toLowerCase() === "cash").reduce((s, p) => s + (p.amount || 0), 0);
  const bankCollections = fyPayments.filter((p) => String(p.method || "").toLowerCase() === "bank").reduce((s, p) => s + (p.amount || 0), 0);
  const profit = totalSales - totalExpenses;

  const months = useMemo(() => {
    const labels = monthLabelsBetweenDates(dateFrom, dateTo, rule);
    return labels.map(({ key, label }) => {
      const monthBills = fyBills.filter((b) => b.bill_date?.startsWith(key));
      const monthExp = fyExpenses.filter((e) => e.date?.startsWith(key));
      return {
        label,
        key,
        sales: monthBills.reduce((s, b) => s + (b.total_amount || 0), 0),
        expenses: monthExp.reduce((s, e) => s + (e.amount || 0), 0),
      };
    });
  }, [fyBills, fyExpenses, dateFrom, dateTo, rule]);

  const periodLabel = formatPeriodForExport(dateFrom, dateTo, rule);

  return (
    <div>
      <PageHeader
        title="Profit & Loss / Fund Flow"
        subtitle="Sales, expenses, and collections for the selected period"
        permissionResource="reports_pnl"
        dateRange={periodLabel}
        exportData={months.map((m) => ({
          Month: m.label,
          [`Sales (${curCode})`]: m.sales,
          [`Expenses (${curCode})`]: m.expenses,
          [`Profit/Loss (${curCode})`]: m.sales - m.expenses,
        }))}
      />

      <Tabs value={periodMode} onValueChange={setPeriodMode} className="mb-6">
        <TabsList>
          <TabsTrigger value="financial-year">Financial Year</TabsTrigger>
          <TabsTrigger value="date-range">Date range</TabsTrigger>
        </TabsList>
        <TabsContent value="financial-year" className="mt-3">
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <Label className="text-xs">Financial year</Label>
              <Select onValueChange={applyFyPreset}>
                <SelectTrigger className="w-[min(100vw-2rem,320px)] h-9 text-xs">
                  <SelectValue placeholder="Choose a financial year" />
                </SelectTrigger>
                <SelectContent>
                  {fyOptions.map((f) => (
                    <SelectItem key={f.value} value={f.value}>
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </TabsContent>
        <TabsContent value="date-range" className="mt-3">
          <div className="flex gap-3 items-end flex-wrap">
            <div>
              <Label className="text-xs">From (date)</Label>
              <Input type="date" className="h-9 w-40" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">To (date)</Label>
              <Input type="date" className="h-9 w-40" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground">Total Sales</p>
            <p className="text-2xl font-bold mt-1">{fmt(totalSales)}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground">Total Expenses</p>
            <p className="text-2xl font-bold mt-1 text-destructive">{fmt(totalExpenses)}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground">Net Profit/Loss</p>
            <p className={`text-2xl font-bold mt-1 ${profit >= 0 ? "text-emerald-600" : "text-destructive"}`}>
              {fmt(profit)}
            </p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground">Collections</p>
            <p className="text-2xl font-bold mt-1">{fmt(totalCollections)}</p>
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
              <TrendingUp className="w-3 h-3" /> Cash: {fmt(cashCollections)} | Bank:{" "}
              {fmt(bankCollections)}
            </p>
          </CardContent>
        </Card>
      </div>
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-sm">Monthly breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th className="text-left py-2">Month</th>
                  <th className="text-right py-2">Sales ({curCode})</th>
                  <th className="text-right py-2">Expenses ({curCode})</th>
                  <th className="text-right py-2">Profit/Loss ({curCode})</th>
                </tr>
              </thead>
              <tbody>
                {months.map((m) => (
                  <tr key={m.key} className="border-b last:border-0">
                    <td className="py-2">{m.label}</td>
                    <td className="py-2 text-right">{fmt(m.sales)}</td>
                    <td className="py-2 text-right">{fmt(m.expenses)}</td>
                    <td
                      className={`py-2 text-right font-medium ${
                        m.sales - m.expenses >= 0 ? "text-emerald-600" : "text-destructive"
                      }`}
                    >
                      {fmt(m.sales - m.expenses)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
