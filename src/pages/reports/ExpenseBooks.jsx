import React, { useMemo, useState } from "react";
import { db } from "@/services/SupabaseService";
import { useQuery } from "@tanstack/react-query";
import PageHeader from "@/components/shared/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { format, parseISO, isWithinInterval, startOfDay, endOfDay } from "date-fns";
import { formatMonthRangeForExport, formatPeriodForExport } from "@/lib/financialYear";
import { sanitizeMojibakeText } from "@/lib/utils";
import { useFinancialYearRule } from "@/hooks/useFinancialYearRule";
import { useAppCurrency } from "@/hooks/useAppCurrency";

export default function ExpenseBooks() {
  const { rule } = useFinancialYearRule();
  const { format: fmt, code: curCode } = useAppCurrency();
  const [bookTab, setBookTab] = useState("cash-daily");
  const [dailyDateFrom, setDailyDateFrom] = useState("");
  const [dailyDateTo, setDailyDateTo] = useState("");
  const [monthlyMonthFrom, setMonthlyMonthFrom] = useState(format(new Date(), "yyyy-MM"));
  const [monthlyMonthTo, setMonthlyMonthTo] = useState(format(new Date(), "yyyy-MM"));

  const { data: expenses = [] } = useQuery({ queryKey: ["expenses-report"], queryFn: () => db.Expense.list("-date", 2000) });

  const dailyRangeLabel = useMemo(
    () => formatPeriodForExport(dailyDateFrom, dailyDateTo, rule),
    [dailyDateFrom, dailyDateTo, rule]
  );
  const monthlyRangeLabel = useMemo(
    () => formatMonthRangeForExport(monthlyMonthFrom, monthlyMonthTo, rule),
    [monthlyMonthFrom, monthlyMonthTo, rule]
  );

  const filteredDaily = useMemo(() => {
    const start = dailyDateFrom ? startOfDay(parseISO(dailyDateFrom)) : null;
    const end = dailyDateTo ? endOfDay(parseISO(dailyDateTo)) : null;
    return expenses.filter((e) => {
      if (!e.date) return false;
      const d = parseISO(e.date);
      if (start && end) return isWithinInterval(d, { start, end });
      if (start && d < start) return false;
      if (end && d > end) return false;
      return true;
    });
  }, [expenses, dailyDateFrom, dailyDateTo]);

  const monthlyBounds = useMemo(() => {
    const from = parseISO(`${monthlyMonthFrom}-01`);
    const toEnd = new Date(parseISO(`${monthlyMonthTo}-01`).getFullYear(), parseISO(`${monthlyMonthTo}-01`).getMonth() + 1, 0);
    return { start: from, end: toEnd };
  }, [monthlyMonthFrom, monthlyMonthTo]);

  const filteredMonthly = useMemo(() => {
    return expenses.filter((e) => {
      if (!e.date) return false;
      const d = parseISO(e.date);
      return isWithinInterval(d, { start: monthlyBounds.start, end: monthlyBounds.end });
    });
  }, [expenses, monthlyBounds]);

  const isMonthlyView = bookTab === "cash-monthly" || bookTab === "bank-monthly";
  const activeData = isMonthlyView ? filteredMonthly : filteredDaily;
  const cashExpenses = activeData.filter((e) => e.payment_mode === "cash");
  const bankExpenses = activeData.filter((e) => e.payment_mode === "bank");

  const exportRows = bookTab.startsWith("cash") ? cashExpenses : bankExpenses;
  const periodForExport = isMonthlyView ? monthlyRangeLabel : dailyRangeLabel;

  const monthLabelForExpense = (isoDate) => {
    if (!isoDate) return "Unknown";
    const d = parseISO(isoDate);
    return format(d, "MMM yyyy");
  };

  const DayTable = ({ data }) => {
    const byDay = {};
    data.forEach((e) => {
      const d = e.date;
      if (!byDay[d]) byDay[d] = [];
      byDay[d].push(e);
    });
    return (
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-xs text-muted-foreground">
            <th className="text-left py-2">Date</th>
            <th className="text-left py-2">Category</th>
            <th className="text-left py-2">Description</th>
            <th className="text-right py-2">Amount ({curCode})</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(byDay)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([day, items]) => (
              <React.Fragment key={day}>
                {items.map((e, i) => (
                  <tr key={e.id} className="border-b last:border-0">
                    {i === 0 && (
                      <td className="py-2 font-medium" rowSpan={items.length}>
                        {day}
                      </td>
                    )}
                    <td className="py-2">{e.category}</td>
                    <td className="py-2 text-muted-foreground text-xs">{sanitizeMojibakeText(e.description || "-")}</td>
                    <td className="py-2 text-right">{fmt(e.amount || 0)}</td>
                  </tr>
                ))}
              </React.Fragment>
            ))}
        </tbody>
        <tfoot>
          <tr className="border-t font-bold">
            <td className="py-2" colSpan={3}>
              Total
            </td>
            <td className="py-2 text-right">{fmt(data.reduce((s, e) => s + (e.amount || 0), 0))}</td>
          </tr>
        </tfoot>
      </table>
    );
  };

  const MonthTable = ({ data }) => {
    const byMonthCategory = {};
    data.forEach((e) => {
      const monthKey = e.date ? monthLabelForExpense(e.date) : "Unknown";
      const catKey = `${monthKey}||${e.category}`;
      if (!byMonthCategory[catKey]) byMonthCategory[catKey] = { month: monthKey, category: e.category, total: 0 };
      byMonthCategory[catKey].total += e.amount || 0;
    });
    const rows = Object.values(byMonthCategory).sort((a, b) => {
      const md = String(a.month).localeCompare(String(b.month));
      return md !== 0 ? md : a.category.localeCompare(b.category);
    });
    const byMonth = {};
    rows.forEach((r) => {
      if (!byMonth[r.month]) byMonth[r.month] = [];
      byMonth[r.month].push(r);
    });
    const grandTotal = data.reduce((s, e) => s + (e.amount || 0), 0);
    return (
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-xs text-muted-foreground">
            <th className="text-left py-2">Month / Year</th>
            <th className="text-left py-2">Category</th>
            <th className="text-right py-2">Total ({curCode})</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(byMonth).map(([month, items]) => (
            <React.Fragment key={month}>
              {items.map((row, i) => (
                <tr key={`${month}-${row.category}`} className="border-b last:border-0">
                  {i === 0 && (
                    <td className="py-2 font-medium align-top" rowSpan={items.length}>
                      {month}
                    </td>
                  )}
                  <td className="py-2">{row.category}</td>
                  <td className="py-2 text-right">{fmt(row.total)}</td>
                </tr>
              ))}
            </React.Fragment>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t font-bold">
            <td className="py-2" colSpan={2}>
              Grand Total
            </td>
            <td className="py-2 text-right">{fmt(grandTotal)}</td>
          </tr>
        </tfoot>
      </table>
    );
  };

  const bookTitle =
    bookTab === "cash-daily"
      ? "Cash Book (Daily)"
      : bookTab === "cash-monthly"
        ? "Cash Book (Monthly)"
        : bookTab === "bank-daily"
          ? "Bank Book (Daily)"
          : "Bank Book (Monthly)";

  return (
    <div>
      <PageHeader
        title={`Expense Books - ${bookTitle}`}
        subtitle="Cash Book & Bank Book"
        permissionResource="reports_expenses"
        dateRange={periodForExport}
        exportData={exportRows.map((e) => ({
          Date: e.date,
          Category: e.category,
          Description: e.description || "-",
          Amount: e.amount || 0,
          Mode: e.payment_mode,
        }))}
      />

      {isMonthlyView ? (
        <div className="flex gap-3 mb-4 items-end flex-wrap">
          <div>
            <Label className="text-xs">From (month / year)</Label>
            <Input type="month" className="h-9 w-44" value={monthlyMonthFrom} onChange={(e) => setMonthlyMonthFrom(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">To (month / year)</Label>
            <Input type="month" className="h-9 w-44" value={monthlyMonthTo} onChange={(e) => setMonthlyMonthTo(e.target.value)} />
          </div>
          <div className="text-sm text-muted-foreground">
            {filteredMonthly.length} entries · {fmt(filteredMonthly.reduce((s, e) => s + (e.amount || 0), 0))}
          </div>
        </div>
      ) : (
        <div className="flex gap-3 mb-4 items-end flex-wrap">
          <div>
            <Label className="text-xs">From (date)</Label>
            <Input type="date" className="h-9 w-40" value={dailyDateFrom} onChange={(e) => setDailyDateFrom(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">To (date)</Label>
            <Input type="date" className="h-9 w-40" value={dailyDateTo} onChange={(e) => setDailyDateTo(e.target.value)} />
          </div>
          <div className="text-sm text-muted-foreground">
            {filteredDaily.length} entries · {fmt(filteredDaily.reduce((s, e) => s + (e.amount || 0), 0))}
          </div>
        </div>
      )}

      <Tabs value={bookTab} onValueChange={setBookTab}>
        <TabsList className="mb-4 flex flex-wrap h-auto gap-1">
          <TabsTrigger value="cash-daily">Cash Book (Daily)</TabsTrigger>
          <TabsTrigger value="cash-monthly">Cash Book (Monthly)</TabsTrigger>
          <TabsTrigger value="bank-daily">Bank Book (Daily)</TabsTrigger>
          <TabsTrigger value="bank-monthly">Bank Book (Monthly)</TabsTrigger>
        </TabsList>
        <TabsContent value="cash-daily">
          <Card className="border-0 shadow-sm">
            <CardContent className="pt-4">
              <DayTable data={cashExpenses} />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="cash-monthly">
          <Card className="border-0 shadow-sm">
            <CardContent className="pt-4">
              <MonthTable data={cashExpenses} />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="bank-daily">
          <Card className="border-0 shadow-sm">
            <CardContent className="pt-4">
              <DayTable data={bankExpenses} />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="bank-monthly">
          <Card className="border-0 shadow-sm">
            <CardContent className="pt-4">
              <MonthTable data={bankExpenses} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
