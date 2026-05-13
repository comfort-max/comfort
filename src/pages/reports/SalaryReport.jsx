import React, { useState, useMemo, useEffect, useRef } from "react";
import { db } from "@/services/SupabaseService";
import { useQuery } from "@tanstack/react-query";
import PageHeader from "@/components/shared/PageHeader";
import DataTable from "@/components/shared/DataTable";
import StatusBadge from "@/components/shared/StatusBadge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  getDefaultFYOption,
  formatPeriodForExport,
  formatMonthRangeForExport,
  monthRangeFromDates,
  salaryRecordInMonthRange,
} from "@/lib/financialYear";
import { useFinancialYearRule } from "@/hooks/useFinancialYearRule";
import { useAppCurrency } from "@/hooks/useAppCurrency";
import { sortByLocaleKey, CALENDAR_MONTH_NAMES } from "@/lib/utils";

const MONTHS = CALENDAR_MONTH_NAMES;

export default function SalaryReport() {
  const { format: fmt } = useAppCurrency();
  const { rule, isLoading: fyLoading } = useFinancialYearRule();
  const [tab, setTab] = useState("monthly");
  const [empFilter, setEmpFilter] = useState("all");
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
  const [accumulatedFromMonth, setAccumulatedFromMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [accumulatedToMonth, setAccumulatedToMonth] = useState(() => new Date().toISOString().slice(0, 7));

  const { data: records = [], isLoading } = useQuery({ queryKey: ["salary-report"], queryFn: () => db.SalaryRecord.list("-created_date", 1000) });
  const { data: employees = [] } = useQuery({ queryKey: ["employees-active"], queryFn: () => db.Employee.filter({ status: "active" }) });
  const employeesSorted = useMemo(() => sortByLocaleKey(employees), [employees]);

  const { fromIdx, toIdx } = useMemo(() => monthRangeFromDates(dateFrom, dateTo), [dateFrom, dateTo]);

  const filtered = useMemo(() => {
    return records.filter((r) => {
      if (!salaryRecordInMonthRange(r, fromIdx, toIdx)) return false;
      if (empFilter !== "all" && r.employee_id !== empFilter) return false;
      return true;
    });
  }, [records, fromIdx, toIdx, empFilter]);

  const [accFromYear, accFromMonth] = accumulatedFromMonth.split("-").map(Number);
  const [accToYear, accToMonth] = accumulatedToMonth.split("-").map(Number);
  const accFromIdx = accFromYear * 12 + accFromMonth;
  const accToIdx = accToYear * 12 + accToMonth;

  const accumulatedByEmp = useMemo(() => {
    const byEmp = {};
    records.forEach((r) => {
      if (empFilter !== "all" && r.employee_id !== empFilter) return;
      const rDate = r.year * 12 + (r.month || 1);
      if (rDate < accFromIdx || rDate > accToIdx) return;
      const emp = r.employee_name || "Unknown";
      if (!byEmp[emp]) byEmp[emp] = { totalSalary: 0, count: 0 };
      byEmp[emp].totalSalary += r.net_salary || 0;
      byEmp[emp].count++;
    });
    return byEmp;
  }, [records, accFromMonth, accFromYear, accToMonth, accToYear, empFilter]);

  const periodForExport = tab === "monthly"
    ? formatPeriodForExport(dateFrom, dateTo, rule)
    : formatMonthRangeForExport(accumulatedFromMonth, accumulatedToMonth, rule);

  const exportDataMonthly = filtered.map((r) => ({
    Employee: r.employee_name,
    Month: MONTHS[(r.month || 1) - 1],
    Year: r.year,
    Basic: r.basic_salary || 0,
    Incentive: r.incentive || 0,
    Bonus: r.bonus || 0,
    Deductions: r.deductions || 0,
    "Net Salary": r.net_salary || 0,
    Status: r.payment_status,
  }));

  const exportDataAccumulated = Object.entries(accumulatedByEmp)
    .sort(([, a], [, b]) => b.totalSalary - a.totalSalary)
    .map(([emp, data]) => ({
      Employee: emp,
      Months: data.count,
      "Total Net Salary": data.totalSalary,
    }));

  const columns = useMemo(
    () => [
      { key: "employee", header: "Employee", accessor: "employee_name", sortable: true },
      { key: "period", header: "Period", render: (r) => `${MONTHS[(r.month || 1) - 1]} ${r.year}` },
      { key: "basic", header: "Basic", render: (r) => fmt(r.basic_salary || 0) },
      { key: "incentive", header: "Incentive", render: (r) => fmt(r.incentive || 0) },
      { key: "bonus", header: "Bonus", render: (r) => fmt(r.bonus || 0) },
      { key: "deductions", header: "Deductions", render: (r) => fmt(r.deductions || 0) },
      { key: "net", header: "Net", render: (r) => <span className="font-semibold">{fmt(r.net_salary || 0)}</span> },
      { key: "status", header: "Status", render: (r) => <StatusBadge status={r.payment_status} /> },
    ],
    [fmt]
  );

  return (
    <div>
      <PageHeader
        title="Salary Report"
        permissionResource="reports_salary"
        dateRange={periodForExport}
        exportData={tab === "monthly" ? exportDataMonthly : exportDataAccumulated}
      />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="monthly">Monthly</TabsTrigger>
          <TabsTrigger value="accumulated">Accumulated</TabsTrigger>
        </TabsList>
        <TabsContent value="monthly">
          <div className="flex gap-3 mb-4 items-end flex-wrap">
            <div>
              <Label className="text-xs">From</Label>
              <Input type="date" className="h-9 w-40" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">To</Label>
              <Input type="date" className="h-9 w-40" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>
            <Select value={empFilter} onValueChange={setEmpFilter}>
              <SelectTrigger className="w-48 h-9">
                <SelectValue placeholder="All Employees" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Employees</SelectItem>
                {employeesSorted.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DataTable columns={columns} data={filtered} loading={isLoading} searchPlaceholder="Search salary records..." />
        </TabsContent>
        <TabsContent value="accumulated">
          <div className="flex gap-3 mb-4 items-end flex-wrap">
            <div>
              <Label className="text-xs">Month/Year from</Label>
              <Input type="month" className="h-9 w-40" value={accumulatedFromMonth} onChange={(e) => setAccumulatedFromMonth(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Month/Year to</Label>
              <Input type="month" className="h-9 w-40" value={accumulatedToMonth} onChange={(e) => setAccumulatedToMonth(e.target.value)} />
            </div>
            <Select value={empFilter} onValueChange={setEmpFilter}>
              <SelectTrigger className="w-48 h-9">
                <SelectValue placeholder="All Employees" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Employees</SelectItem>
                {employeesSorted.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-3">
            {Object.entries(accumulatedByEmp)
              .sort(([, a], [, b]) => b.totalSalary - a.totalSalary)
              .map(([emp, data]) => (
                <Card key={emp} className="border-0 shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-sm">
                      {emp} — {data.count} month(s) · {fmt(data.totalSalary)}
                    </CardTitle>
                  </CardHeader>
                </Card>
              ))}
            {Object.keys(accumulatedByEmp).length === 0 && <div className="text-center py-8 text-muted-foreground">No data for this period</div>}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
