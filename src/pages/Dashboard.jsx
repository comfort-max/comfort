import React, { useMemo } from "react";
import { db } from "@/services/SupabaseService";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "react-router-dom";
import { Banknote, Truck, AlertTriangle, Users, FileText, CreditCard, TrendingUp, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { useAppCurrency } from "@/hooks/useAppCurrency";

const today = format(new Date(), "yyyy-MM-dd");

/** Icon chip: solid bg-* tokens often match text-* and hide the glyph; use explicit contrast. */
const STAT_ICON_THEME = {
  "bg-primary": "bg-primary/15 text-teal-800 dark:text-teal-200 ring-1 ring-primary/25",
  "bg-emerald-500": "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200 ring-1 ring-emerald-500/20",
  "bg-amber-500": "bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200 ring-1 ring-amber-500/20",
  "bg-violet-500": "bg-violet-100 text-violet-800 dark:bg-violet-950/50 dark:text-violet-200 ring-1 ring-violet-500/20",
  "bg-blue-500": "bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-200 ring-1 ring-blue-500/20",
  "bg-cyan-500": "bg-cyan-100 text-cyan-800 dark:bg-cyan-950/50 dark:text-cyan-200 ring-1 ring-cyan-500/20",
  "bg-indigo-500": "bg-indigo-100 text-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-200 ring-1 ring-indigo-500/20",
  "bg-rose-500": "bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-200 ring-1 ring-rose-500/20",
};

function StatCard({ title, value, icon: Icon, color, link }) {
  const chipClass = STAT_ICON_THEME[color] || "bg-muted text-foreground ring-1 ring-border";
  return (
    <Link to={link} className="block">
      <Card className="hover:shadow-lg transition-all duration-300 group border-0 shadow-sm">
        <CardContent className="p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground tracking-wide uppercase">{title}</p>
              <p className="text-2xl font-bold mt-2 tracking-tight">{value}</p>
            </div>
            <div className={cn("p-2.5 rounded-xl shrink-0", chipClass)}>
              <Icon className="w-5 h-5" aria-hidden />
            </div>
          </div>
          <div className="flex items-center gap-1 mt-3 text-xs text-muted-foreground group-hover:text-primary transition-colors">
            View details <ArrowRight className="w-3 h-3" />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

export default function Dashboard() {
  const { format: fmt } = useAppCurrency();
  const { data: bills = [] } = useQuery({ queryKey: ['bills-dashboard'], queryFn: () => db.Bill.list('-created_date', 50), staleTime: 5 * 60 * 1000 });
  const { data: payments = [] } = useQuery({ queryKey: ['payments-all', 'dashboard'], queryFn: () => db.PaymentCollection.list('-created_date', 50), staleTime: 5 * 60 * 1000 });
  const { data: employees = [] } = useQuery({ queryKey: ['employees-dashboard'], queryFn: () => db.Employee.filter({ status: 'active' }), staleTime: 10 * 60 * 1000 });
  const { data: customers = [] } = useQuery({ queryKey: ['customers-dashboard'], queryFn: () => db.Customer.filter({ status: 'active' }), staleTime: 10 * 60 * 1000 });
  const { data: billItems = [] } = useQuery({ queryKey: ['billItems-dashboard'], queryFn: () => db.BillItem.filter({ delivery_status: 'ready_for_delivery' }), staleTime: 5 * 60 * 1000 });

  const todayBills = useMemo(() => bills.filter(b => b.bill_date === today), [bills]);
  const todaySales = useMemo(() => todayBills.reduce((s, b) => s + (b.total_amount || 0), 0), [todayBills]);
  const todayPayments = useMemo(() => payments.filter(p => p.date === today), [payments]);
  const todayCollection = useMemo(() => todayPayments.reduce((s, p) => s + (p.amount || 0), 0), [todayPayments]);
  const totalOutstanding = useMemo(() => bills.reduce((s, b) => s + (b.amount_due || 0), 0), [bills]);
  const readyForDelivery = billItems.length;

  const salesChartData = useMemo(() => {
    const map = {};
    todayBills.forEach(b => { const n = b.salesman_name || 'Unknown'; map[n] = (map[n] || 0) + (b.total_amount || 0); });
    return Object.entries(map).map(([name, amount]) => ({ name, amount }));
  }, [todayBills]);

  const pieData = useMemo(() => {
    const dist = { cash: 0, bank: 0, cheque: 0 };
    todayPayments.forEach(p => { dist[p.method] = (dist[p.method] || 0) + (p.amount || 0); });
    return Object.entries(dist).filter(([, v]) => v > 0).map(([name, value]) => ({ name: name.charAt(0).toUpperCase() + name.slice(1), value }));
  }, [todayPayments]);

  const COLORS = ['hsl(192,70%,35%)', 'hsl(37,90%,55%)', 'hsl(160,60%,40%)'];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">{format(new Date(), "EEEE, dd MMMM yyyy")} · Welcome back</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Today's Sales" value={fmt(todaySales)} icon={Banknote} color="bg-primary" link="/reports/sales" />
        <StatCard title="Today's Collection" value={fmt(todayCollection)} icon={CreditCard} color="bg-emerald-500" link="/reports/payments" />
        <StatCard title="Outstanding" value={fmt(totalOutstanding)} icon={AlertTriangle} color="bg-amber-500" link="/reports/outstanding" />
        <StatCard title="Ready for Delivery" value={readyForDelivery} icon={Truck} color="bg-violet-500" link="/delivery" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Active Employees" value={employees.length} icon={Users} color="bg-blue-500" link="/employees" />
        <StatCard title="Active Customers" value={customers.length} icon={Users} color="bg-cyan-500" link="/customers" />
        <StatCard title="Today's Bills" value={todayBills.length} icon={FileText} color="bg-indigo-500" link="/bills" />
        <StatCard title="Month Revenue" value={fmt(bills.reduce((s, b) => s + (b.total_amount || 0), 0))} icon={TrendingUp} color="bg-rose-500" link="/reports/pnl" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Today's Sales by Salesman</CardTitle></CardHeader>
          <CardContent>
            {salesChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={salesChartData}>
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(v) => fmt(v)} />
                  <Bar dataKey="amount" fill="hsl(192,70%,35%)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[250px] flex items-center justify-center text-sm text-muted-foreground">No sales data for today</div>
            )}
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Payment Collection by Method</CardTitle></CardHeader>
          <CardContent>
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={90} dataKey="value" label={({ name, value }) => `${name}: ${fmt(value)}`}>
                    {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v) => fmt(v)} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[250px] flex items-center justify-center text-sm text-muted-foreground">No payments collected today</div>
            )}
          </CardContent>
        </Card>
      </div>
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-semibold">Recent Bills</CardTitle>
          <Link to="/bills" className="text-xs text-primary hover:underline flex items-center gap-1">View all <ArrowRight className="w-3 h-3" /></Link>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th className="text-left py-2 font-medium">Bill #</th>
                  <th className="text-left py-2 font-medium">Date</th>
                  <th className="text-left py-2 font-medium">Customer</th>
                  <th className="text-left py-2 font-medium">Salesman</th>
                  <th className="text-right py-2 font-medium">Amount</th>
                  <th className="text-right py-2 font-medium">Due</th>
                </tr>
              </thead>
              <tbody>
                {bills.slice(0, 8).map(bill => (
                  <tr key={bill.id} className="border-b last:border-0 hover:bg-muted/50">
                    <td className="py-2.5 font-medium">{bill.bill_number}</td>
                    <td className="py-2.5 text-muted-foreground">{bill.bill_date}</td>
                    <td className="py-2.5">{bill.customer_name}</td>
                    <td className="py-2.5">{bill.salesman_name || '-'}</td>
                    <td className="py-2.5 text-right font-medium">{fmt(bill.total_amount || 0)}</td>
                    <td className={cn("py-2.5 text-right font-medium", bill.amount_due > 0 ? "text-amber-600" : bill.amount_due < 0 ? "text-sky-700" : "text-emerald-600")}>{fmt(bill.amount_due || 0)}</td>
                  </tr>
                ))}
                {bills.length === 0 && <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">No bills yet</td></tr>}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}