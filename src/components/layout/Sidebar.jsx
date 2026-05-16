import React, { useState, useMemo } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard, Users, UserCheck, Store, FileText, CreditCard,
  Wallet, Truck, ClipboardList, BarChart3, Receipt, AlertTriangle,
  BookOpen, TrendingUp, Settings, Shield, Trash2,
  ChevronDown, ChevronRight, Package, UserPlus, Tag, ListChecks,
  Percent, FolderOpen, Menu, X, Building2, Mail, Zap, LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useCompanyBranding } from "@/hooks/useCompanyBranding";
import { usePermissions } from "@/hooks/usePermissions";
import { useAppCurrency } from "@/hooks/useAppCurrency";
import { CompanyLogoMark } from "@/components/shared/CompanyLogoMark";
import { useAuth } from "@/lib/AuthContext";

/** Nav glyph: company display currency symbol from settings */
function CurrencySidebarIcon({ className }) {
  const { symbol } = useAppCurrency();
  return (
    <span
      className={cn("inline-flex w-4 h-4 shrink-0 items-center justify-center text-[15px] font-semibold leading-none", className)}
      aria-hidden
    >
      {symbol}
    </span>
  );
}

const menuGroups = [
  {
    label: "MASTER DATA",
    icon: FolderOpen,
    items: [
      { label: "Employees", path: "/employees", icon: Users },
      { label: "Customers", path: "/customers", icon: UserCheck },
      { label: "Vendors", path: "/vendors", icon: Store },
    ]
  },
  {
    label: "TRANSACTIONS",
    icon: FileText,
    items: [
      { label: "Bills / Orders", path: "/bills", icon: FileText },
      { label: "Vendor Distribution", path: "/vendor-orders", icon: Package },
      { label: "Vendor Jobs", path: "/vendor-jobs", icon: ClipboardList },
      { label: "Vendor Billing", path: "/vendor-billing", icon: Receipt },
      { label: "Payment Collection", path: "/payment-collection", icon: CreditCard },
      { label: "Expenses", path: "/expenses", icon: Wallet },
      { label: "Salary", path: "/salary", icon: CurrencySidebarIcon },
    ]
  },
  {
    label: "DELIVERY",
    icon: Truck,
    items: [
      { label: "Delivery Management", path: "/delivery", icon: Truck },
    ]
  },
  {
    label: "REPORTS",
    icon: BarChart3,
    items: [
      { label: "Sales Reports", path: "/reports/sales", icon: BarChart3 },
      { label: "Payment Reports", path: "/reports/payments", icon: CreditCard },
      { label: "Outstanding Reports", path: "/reports/outstanding", icon: AlertTriangle },
      { label: "Expense Books", path: "/reports/expenses", icon: BookOpen },
      { label: "P&L / Fund Flow", path: "/reports/pnl", icon: TrendingUp },
      { label: "Salary Report", path: "/reports/salary", icon: CurrencySidebarIcon },
      { label: "Vendor Business Volume", path: "/reports/vendor-volume", icon: Store },
    ]
  },
  {
    label: "ADMINISTRATION",
    icon: Settings,
    items: [
      { label: "User Management", path: "/admin/users", icon: Shield },

      { label: "Invitations", path: "/admin/invitations", icon: UserPlus },
      { label: "Trash Bin", path: "/admin/trash", icon: Trash2 },
      { label: "Vendor Rates", path: "/admin/vendor-rates", icon: Tag },
      { label: "Company Settings", path: "/admin/company-settings", icon: Building2 },
      { label: "Rate List", path: "/admin/rate-list", icon: ListChecks },
      { label: "Incentive Management", path: "/admin/incentives", icon: Percent },
      { label: "Expense Categories", path: "/admin/expense-categories", icon: FolderOpen },
      { label: "Role Management", path: "/admin/role-management", icon: Shield },
      { label: "Communication Templates", path: "/admin/communication-templates", icon: Mail },
      { label: "Email Settings", path: "/admin/email-settings", icon: Mail },
      { label: "Data Optimization", path: "/admin/data-optimization", icon: Zap },
    ],
  },
];

export default function Sidebar({ collapsed, setCollapsed }) {
  const location = useLocation();
  const [expandedGroups, setExpandedGroups] = useState(["MASTER DATA", "TRANSACTIONS", "DELIVERY", "REPORTS"]);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { companyName, resolvedLogoSrc } = useCompanyBranding();
  const { isAdmin, canAccessPath } = usePermissions();
  const { user, logout } = useAuth();

  const accountLabel = user?.full_name?.trim() || user?.email || "Signed in";
  const showEmailSubline = Boolean(user?.full_name?.trim() && user?.email);

  const visibleMenuGroups = useMemo(() => {
    if (isAdmin) return menuGroups;
    return menuGroups
      .map((g) => ({
        ...g,
        items: g.items.filter((it) => canAccessPath(it.path)),
      }))
      .filter((g) => g.items.length > 0);
  }, [isAdmin, canAccessPath]);

  const showDashboard = isAdmin || canAccessPath("/");

  const toggleGroup = (label) => {
    setExpandedGroups(prev =>
      prev.includes(label) ? prev.filter(g => g !== label) : [...prev, label]
    );
  };

  const isActive = (path) => location.pathname === path;

  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* Logo — from Company Settings; signed URL when storage bucket is private */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-sidebar-border">
        <div className="w-9 h-9 rounded-lg bg-sidebar-primary flex items-center justify-center overflow-hidden shrink-0 ring-1 ring-sidebar-border/30">
          <CompanyLogoMark
            src={resolvedLogoSrc}
            companyName={companyName}
            imgClassName="w-full h-full object-contain bg-sidebar p-0.5"
            letterClassName="text-sidebar-primary-foreground font-bold text-sm"
          />
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <h1 className="text-sidebar-foreground font-bold text-lg tracking-tight truncate">{companyName}</h1>
            <p className="text-sidebar-foreground/50 text-[10px] tracking-wider">LAUNDRY MANAGEMENT</p>
          </div>
        )}
      </div>

      {/* Dashboard */}
      {showDashboard && (
      <div className="px-3 pt-4 pb-2">
        <Link
          to="/"
          className={cn(
            "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
            isActive("/")
              ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-lg shadow-sidebar-primary/20"
              : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          )}
        >
          <LayoutDashboard className="w-4 h-4 shrink-0" />
          {!collapsed && "Dashboard"}
        </Link>
      </div>
      )}

      {/* Menu Groups */}
      <nav className="flex-1 overflow-y-auto px-3 pb-4 space-y-1">
        {visibleMenuGroups.map(group => (
          <div key={group.label}>
            <button
              onClick={() => toggleGroup(group.label)}
              className="flex items-center justify-between w-full px-3 py-2 mt-3 text-[10px] font-semibold tracking-widest text-sidebar-foreground/70 hover:text-sidebar-foreground transition-colors"
            >
              {!collapsed && group.label}
              {collapsed ? (
                <group.icon className="w-4 h-4 text-sidebar-foreground/70" />
              ) : (
                expandedGroups.includes(group.label)
                  ? <ChevronDown className="w-3 h-3" />
                  : <ChevronRight className="w-3 h-3" />
              )}
            </button>
            {(expandedGroups.includes(group.label) || collapsed) && (
              <div className="space-y-0.5">
                {group.items.map(item => (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setMobileOpen(false)}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] transition-all",
                      isActive(item.path)
                        ? "bg-sidebar-primary/10 text-sidebar-primary font-medium"
                        : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                    )}
                  >
                    <item.icon className="w-4 h-4 shrink-0" />
                    {!collapsed && item.label}
                  </Link>
                ))}
              </div>
            )}
          </div>
        ))}
      </nav>

      <div className="shrink-0 border-t border-sidebar-border p-3 space-y-2">
        {!collapsed && (
          <p className="px-1 text-[11px] font-medium uppercase tracking-wide text-sidebar-foreground/70">Account</p>
        )}
        {!collapsed && (
          <p className="px-1 text-xs text-sidebar-foreground/80 truncate" title={user?.email || accountLabel}>
            {accountLabel}
            {showEmailSubline ? (
              <span className="block text-[11px] text-sidebar-foreground/50 truncate">{user.email}</span>
            ) : null}
          </p>
        )}
        <button
          type="button"
          title="Log out"
          onClick={() => {
            void logout();
          }}
          className={cn(
            "flex items-center gap-3 rounded-lg text-[13px] font-medium transition-all text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            collapsed ? "w-full justify-center p-2.5" : "w-full px-3 py-2.5"
          )}
        >
          <LogOut className="w-4 h-4 shrink-0" />
          {!collapsed && "Log out"}
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile Toggle */}
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 rounded-lg bg-card shadow-lg border border-border"
      >
        {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>

      {/* Mobile Overlay */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 bg-black/50 z-40" onClick={() => setMobileOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "fixed top-0 left-0 h-screen bg-sidebar z-40 transition-all duration-300 border-r border-sidebar-border",
        collapsed ? "w-16" : "w-64",
        mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      )}>
        {sidebarContent}
      </aside>
    </>
  );
}