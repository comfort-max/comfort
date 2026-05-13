/**
 * Granular RBAC resources. Each maps to a sidebar / app route.
 * Stored on `app_roles.permissions` as:
 *   { [resourceKey]: { view, edit, delete, export, import, … } } — see `resourceCapabilities.js` & `permissions.js`.
 */
export const PERMISSION_RESOURCES = [
  { key: "dashboard", label: "Dashboard", path: "/", group: "Core" },
  { key: "employees", label: "Employees", path: "/employees", group: "Master data" },
  { key: "customers", label: "Customers", path: "/customers", group: "Master data" },
  { key: "vendors", label: "Vendors", path: "/vendors", group: "Master data" },
  { key: "bills", label: "Bills / Orders", path: "/bills", group: "Transactions" },
  { key: "vendor_orders", label: "Vendor Orders (Distribution)", path: "/vendor-orders", group: "Transactions" },
  { key: "vendor_jobs", label: "Vendor Jobs", path: "/vendor-jobs", group: "Transactions" },
  { key: "vendor_billing", label: "Vendor Billing", path: "/vendor-billing", group: "Transactions" },
  { key: "payment_collection", label: "Payment Collection", path: "/payment-collection", group: "Transactions" },
  { key: "expenses", label: "Expenses", path: "/expenses", group: "Transactions" },
  { key: "salary", label: "Salary", path: "/salary", group: "Transactions" },
  { key: "delivery", label: "Delivery Management", path: "/delivery", group: "Delivery" },
  { key: "reports_sales", label: "Sales Reports", path: "/reports/sales", group: "Reports" },
  { key: "reports_payments", label: "Payment Reports", path: "/reports/payments", group: "Reports" },
  { key: "reports_outstanding", label: "Outstanding Reports", path: "/reports/outstanding", group: "Reports" },
  { key: "reports_expenses", label: "Expense Books", path: "/reports/expenses", group: "Reports" },
  { key: "reports_pnl", label: "P&L / Fund Flow", path: "/reports/pnl", group: "Reports" },
  { key: "reports_salary", label: "Salary Report", path: "/reports/salary", group: "Reports" },
  { key: "reports_vendor_volume", label: "Vendor Billing / Volume Report", path: "/reports/vendor-volume", group: "Reports" },
  { key: "admin_users", label: "User Management", path: "/admin/users", group: "Administration" },
  { key: "admin_invitations", label: "Pending Invitations", path: "/admin/invitations", group: "Administration" },
  { key: "admin_trash", label: "Trash Bin", path: "/admin/trash", group: "Administration" },
  { key: "admin_vendor_rates", label: "Vendor Rates", path: "/admin/vendor-rates", group: "Administration" },
  { key: "admin_company_settings", label: "Company Settings", path: "/admin/company-settings", group: "Administration" },
  { key: "admin_rate_list", label: "Rate List", path: "/admin/rate-list", group: "Administration" },
  { key: "admin_incentives", label: "Incentive Management", path: "/admin/incentives", group: "Administration" },
  { key: "admin_expense_categories", label: "Expense Categories", path: "/admin/expense-categories", group: "Administration" },
  { key: "admin_roles", label: "Role Management", path: "/admin/role-management", group: "Administration" },
  { key: "admin_communication_templates", label: "Communication Templates", path: "/admin/communication-templates", group: "Administration" },
  { key: "admin_email_settings", label: "Email Settings", path: "/admin/email-settings", group: "Administration" },
  { key: "admin_data_optimization", label: "Data Optimization", path: "/admin/data-optimization", group: "Administration" },
];

const pathToKey = new Map(PERMISSION_RESOURCES.map((r) => [r.path, r.key]));

/** Resolve permission resource key from current pathname (longest prefix match). */
export function pathToResourceKey(pathname) {
  if (!pathname) return null;
  if (pathToKey.has(pathname)) return pathToKey.get(pathname);
  const noTrail = pathname.replace(/\/$/, "") || "/";
  if (pathToKey.has(noTrail)) return pathToKey.get(noTrail);
  return null;
}
