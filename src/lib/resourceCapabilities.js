/**
 * Per-route capability keys stored under `app_roles.permissions[resourceKey][capabilityKey]`.
 * `inherit` is used when migrating older rows that only had view/edit/delete: missing keys
 * default to the inherited flag until the role is saved again from Role Management.
 *
 * Keep labels concise; tooltips in the matrix use full labels.
 */
import { PERMISSION_RESOURCES } from "@/lib/permissionResources";

/** @typedef {{ key: string, label: string, short?: string, inherit?: "view" | "edit" | "delete" }} ResourceCapability */

/** @type {Record<string, ResourceCapability[]>} */
export const RESOURCE_CAPABILITIES = {
  dashboard: [{ key: "view", label: "View dashboard", short: "View" }],

  employees: [
    { key: "view", label: "View", short: "View" },
    { key: "edit", label: "Add / edit", short: "Edit" },
    { key: "delete", label: "Move to trash", short: "Del", inherit: "edit" },
    { key: "export", label: "Export / print", short: "Export", inherit: "view" },
  ],
  customers: [
    { key: "view", label: "View", short: "View" },
    { key: "edit", label: "Add / edit / status", short: "Edit" },
    { key: "delete", label: "Move to trash", short: "Del", inherit: "edit" },
    { key: "export", label: "Export / print", short: "Export", inherit: "view" },
  ],
  vendors: [
    { key: "view", label: "View", short: "View" },
    { key: "edit", label: "Add / edit / status", short: "Edit" },
    { key: "delete", label: "Move to trash", short: "Del", inherit: "edit" },
    { key: "export", label: "Export / print", short: "Export", inherit: "view" },
  ],

  bills: [
    { key: "view", label: "View", short: "View" },
    { key: "edit", label: "New bill / edit / line items", short: "Edit" },
    { key: "delete", label: "Move bills to trash", short: "Del", inherit: "edit" },
    { key: "export", label: "Export / print / download", short: "Export", inherit: "view" },
    { key: "upload", label: "Upload receipts / files", short: "Upload", inherit: "edit" },
    { key: "bill_notify_send", label: "Email / WhatsApp bill notification to customer", short: "Notify", inherit: "edit" },
  ],

  vendor_orders: [
    { key: "view", label: "View", short: "View" },
    { key: "edit", label: "Assign or change vendor on items", short: "Assign", inherit: "view" },
    { key: "export", label: "Export / print", short: "Export", inherit: "view" },
  ],

  vendor_jobs: [
    { key: "view", label: "View", short: "View" },
    { key: "edit", label: "Mark ready / reassign items", short: "Edit" },
    { key: "delete", label: "Delete / cancel POs", short: "Del", inherit: "edit" },
    { key: "export", label: "Export / print / PDF", short: "Export", inherit: "view" },
    { key: "po_issue", label: "Generate purchase orders", short: "PO", inherit: "edit" },
    { key: "po_cancel", label: "Cancel / delete POs", short: "PO X", inherit: "delete" },
    { key: "po_send", label: "Email / WhatsApp PO", short: "Send", inherit: "edit" },
  ],

  vendor_billing: [
    { key: "view", label: "View", short: "View" },
    { key: "edit", label: "Add / edit billing entries", short: "Edit" },
    { key: "delete", label: "Move entries to trash", short: "Del", inherit: "edit" },
    { key: "export", label: "Export / print", short: "Export", inherit: "view" },
    { key: "upload", label: "Upload payment proof / files", short: "Upload", inherit: "edit" },
    { key: "vendor_payment", label: "Record vendor payment (Pay / bulk pay)", short: "Pay", inherit: "edit" },
  ],

  payment_collection: [
    { key: "view", label: "View", short: "View" },
    { key: "edit", label: "Add / edit payment rows", short: "Edit" },
    { key: "delete", label: "Move payments to trash", short: "Del", inherit: "edit" },
    { key: "export", label: "Export / print", short: "Export", inherit: "view" },
    { key: "customer_payment", label: "Record customer payments (incl. pending lines)", short: "Collect", inherit: "edit" },
  ],

  expenses: [
    { key: "view", label: "View", short: "View" },
    { key: "edit", label: "Add / edit expenses", short: "Edit" },
    { key: "delete", label: "Move to trash", short: "Del", inherit: "edit" },
    { key: "export", label: "Export / print", short: "Export", inherit: "view" },
    { key: "upload", label: "Upload receipts", short: "Upload", inherit: "edit" },
  ],

  salary: [
    { key: "view", label: "View", short: "View" },
    { key: "edit", label: "Add / edit records (admin flows)", short: "Edit" },
    { key: "delete", label: "Move to trash", short: "Del", inherit: "edit" },
    { key: "export", label: "Export / print", short: "Export", inherit: "view" },
    { key: "salary_generate", label: "Generate month sheet", short: "Gen", inherit: "edit" },
    { key: "salary_pay", label: "Record salary payment", short: "Pay", inherit: "edit" },
  ],

  delivery: [
    { key: "view", label: "View", short: "View" },
    { key: "edit", label: "General delivery edits", short: "Edit", inherit: "view" },
    { key: "delete", label: "Move line items to trash", short: "Del", inherit: "edit" },
    { key: "export", label: "Export / print", short: "Export", inherit: "view" },
    { key: "delivery_status", label: "Mark ready / delivered / not ready", short: "Status", inherit: "edit" },
    { key: "delivery_customer_payment", label: "Record payment (delivered unpaid)", short: "Pay", inherit: "edit" },
    { key: "delivery_reminder_send", label: "Send delivery reminders (WhatsApp etc.)", short: "Remind", inherit: "edit" },
    { key: "reminder_log_delete", label: "Delete delivery reminder log rows", short: "Log−", inherit: "delete" },
  ],

  reports_sales: [
    { key: "view", label: "View report", short: "View" },
    { key: "export", label: "Export / print / download", short: "Export", inherit: "view" },
  ],
  reports_payments: [
    { key: "view", label: "View report", short: "View" },
    { key: "export", label: "Export / print / download", short: "Export", inherit: "view" },
  ],
  reports_outstanding: [
    { key: "view", label: "View report", short: "View" },
    { key: "export", label: "Export / print / download", short: "Export", inherit: "view" },
    { key: "reminder_send", label: "Send payment reminders", short: "Remind", inherit: "edit" },
    { key: "reminder_log_delete", label: "Delete payment reminder logs", short: "Log−", inherit: "delete" },
  ],
  reports_expenses: [
    { key: "view", label: "View report", short: "View" },
    { key: "export", label: "Export / print / download", short: "Export", inherit: "view" },
  ],
  reports_pnl: [
    { key: "view", label: "View report", short: "View" },
    { key: "export", label: "Export / print / download", short: "Export", inherit: "view" },
  ],
  reports_salary: [
    { key: "view", label: "View report", short: "View" },
    { key: "export", label: "Export / print / download", short: "Export", inherit: "view" },
  ],
  reports_vendor_volume: [
    { key: "view", label: "View report", short: "View" },
    { key: "export", label: "Export / print / download", short: "Export", inherit: "view" },
    { key: "margin_detail", label: "Vendor cost / margin columns & tabs", short: "Margin" },
  ],

  admin_users: [
    { key: "view", label: "View users", short: "View" },
    { key: "edit", label: "Edit users / roles", short: "Edit" },
    { key: "invite", label: "Invite / resend invites", short: "Invite", inherit: "edit" },
  ],
  admin_invitations: [
    { key: "view", label: "View", short: "View" },
    { key: "edit", label: "Manage invitations", short: "Edit", inherit: "view" },
    { key: "delete", label: "Revoke / delete invites", short: "Del", inherit: "edit" },
  ],
  admin_trash: [
    { key: "view", label: "View trash", short: "View" },
    { key: "edit", label: "Restore items", short: "Restore", inherit: "view" },
    { key: "delete", label: "Permanent delete / empty trash", short: "Del", inherit: "edit" },
  ],
  admin_vendor_rates: [
    { key: "view", label: "View", short: "View" },
    { key: "edit", label: "Add / edit rates", short: "Edit" },
    { key: "delete", label: "Delete rate rows", short: "Del", inherit: "edit" },
    { key: "export", label: "Export / download templates", short: "Export", inherit: "view" },
    { key: "import", label: "Import / replace rates", short: "Import", inherit: "edit" },
  ],
  admin_company_settings: [
    { key: "view", label: "View", short: "View" },
    { key: "edit", label: "Save company / branding / terms", short: "Edit" },
    { key: "delete", label: "Remove payment methods / terms", short: "Del", inherit: "edit" },
    { key: "upload", label: "Upload logo / assets", short: "Upload", inherit: "edit" },
  ],
  admin_rate_list: [
    { key: "view", label: "View", short: "View" },
    { key: "edit", label: "Add / edit items", short: "Edit" },
    { key: "delete", label: "Delete rows", short: "Del", inherit: "edit" },
    { key: "export", label: "Export", short: "Export", inherit: "view" },
    { key: "import", label: "Import list", short: "Import", inherit: "edit" },
  ],
  admin_incentives: [
    { key: "view", label: "View", short: "View" },
    { key: "edit", label: "Add / edit slabs", short: "Edit" },
    { key: "delete", label: "Delete slabs / import replace", short: "Del", inherit: "edit" },
    { key: "export", label: "Export CSV/Excel", short: "Export", inherit: "view" },
    { key: "import", label: "Import slabs", short: "Import", inherit: "edit" },
  ],
  admin_expense_categories: [
    { key: "view", label: "View", short: "View" },
    { key: "edit", label: "Add / edit categories", short: "Edit" },
    { key: "delete", label: "Delete category", short: "Del", inherit: "edit" },
  ],
  admin_roles: [
    { key: "view", label: "View roles", short: "View" },
    { key: "edit", label: "Create / edit roles & matrix", short: "Edit" },
    { key: "delete", label: "Delete custom roles", short: "Del", inherit: "edit" },
  ],
  admin_communication_templates: [
    { key: "view", label: "View", short: "View" },
    { key: "edit", label: "Create / edit templates", short: "Edit" },
    { key: "delete", label: "Delete templates", short: "Del", inherit: "edit" },
  ],
  admin_email_settings: [
    { key: "view", label: "View", short: "View" },
    { key: "edit", label: "Edit from name / display settings", short: "Edit", inherit: "view" },
    { key: "test_send", label: "Send test email", short: "Test", inherit: "edit" },
  ],
  admin_data_optimization: [
    { key: "view", label: "View", short: "View" },
    { key: "edit", label: "Backup / restore tools", short: "Edit" },
    { key: "delete", label: "Manual delete / retention", short: "Del", inherit: "edit" },
    { key: "export", label: "Export backup", short: "Export", inherit: "view" },
    { key: "import", label: "Import backup", short: "Import", inherit: "edit" },
  ],
};

function ensureAllResources() {
  const out = { ...RESOURCE_CAPABILITIES };
  for (const r of PERMISSION_RESOURCES) {
    if (!out[r.key]) {
      out[r.key] = [
        { key: "view", label: "View", short: "View" },
        { key: "edit", label: "Edit", short: "Edit" },
        { key: "delete", label: "Delete", short: "Del", inherit: "edit" },
        { key: "export", label: "Export", short: "Export", inherit: "view" },
      ];
    }
  }
  return out;
}

export const RESOURCE_CAPABILITIES_ALL = ensureAllResources();

/** Stable column order for the role matrix (union of keys; resources may not use all). */
export const MATRIX_CAPABILITY_ORDER = [
  "view",
  "edit",
  "delete",
  "export",
  "import",
  "upload",
  "customer_payment",
  "vendor_payment",
  "po_issue",
  "po_cancel",
  "po_send",
  "delivery_status",
  "delivery_customer_payment",
  "delivery_reminder_send",
  "reminder_send",
  "reminder_log_delete",
  "salary_generate",
  "salary_pay",
  "invite",
  "margin_detail",
  "bill_notify_send",
  "test_send",
];

const CAPABILITY_LABELS = {
  view: "View",
  edit: "Edit",
  delete: "Delete",
  export: "Export",
  import: "Import",
  upload: "Upload",
  customer_payment: "Cust. pay",
  vendor_payment: "Vendor pay",
  po_issue: "Issue PO",
  po_cancel: "Cancel PO",
  po_send: "Send PO",
  delivery_status: "Delivery Δ",
  delivery_customer_payment: "Deliv. pay",
  delivery_reminder_send: "Deliv. remind",
  reminder_send: "Pay remind",
  reminder_log_delete: "Log del",
  salary_generate: "Gen salary",
  salary_pay: "Pay salary",
  invite: "Invite",
  margin_detail: "Margin",
  bill_notify_send: "Bill notify",
  test_send: "Test email",
};

/** @param {string} resourceKey */
export function capabilitiesForResource(resourceKey) {
  return RESOURCE_CAPABILITIES_ALL[resourceKey] || [{ key: "view", label: "View", short: "View" }];
}

/** Whether this capability applies to the resource (matrix shows checkbox vs em dash). */
export function resourceHasCapabilityKey(resourceKey, capabilityKey) {
  return capabilitiesForResource(resourceKey).some((c) => c.key === capabilityKey);
}

export function shortLabelForCapability(key) {
  return CAPABILITY_LABELS[key] || key;
}
