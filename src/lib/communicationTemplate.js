import { formatCurrencyAmount } from "@/lib/currency";

/** Built-in template purposes (slug → metadata). Custom purposes use DB `purpose_label`. */
export const PURPOSE_REGISTRY = {
  po_vendor: {
    label: "PO to Vendor",
    placeholders: [
      "{{vendor_name}}",
      "{{order_number}}",
      "{{order_date}}",
      "{{total_qty}}",
      "{{total_amount}}",
      "{{company_name}}",
    ],
    defaultEmail: {
      subject: "Purchase Order {{order_number}} — {{vendor_name}}",
      body: `Dear {{vendor_name}},

Please find our purchase order {{order_number}} dated {{order_date}}.

Total quantity: {{total_qty}}
Order value: {{total_amount}}

Kindly confirm receipt and processing.

Thank you,
{{company_name}}`,
    },
  },
  payment_reminder_customer: {
    label: "Payment Reminder - Customer",
    placeholders: [
      "{{customer_name}}",
      "{{bill_number}}",
      "{{bill_list}}",
      "{{grand_total}}",
      "{{amount_due}}",
      "{{total_outstanding}}",
      "{{company_name}}",
    ],
    defaultEmail: {
      subject: "Payment reminder — outstanding bills",
      body: `Dear {{customer_name}},

This is a gentle reminder regarding your outstanding payments.

{{bill_list}}

Total outstanding: {{total_outstanding}}

Please arrange payment at your earliest convenience.

Thank you,
{{company_name}}`,
    },
  },
  job_reminder_vendor: {
    label: "Job Reminder - Vendor",
    placeholders: [
      "{{vendor_name}}",
      "{{bill_number}}",
      "{{items}}",
      "{{total_qty}}",
      "{{total_amount}}",
      "{{company_name}}",
    ],
    defaultEmail: {
      subject: "Reminder — pending work for {{vendor_name}}",
      body: `Dear {{vendor_name}},

Regarding bill {{bill_number}}, the following is still pending:

{{items}}

Total quantity: {{total_qty}}
Total amount: {{total_amount}}

Please update us on progress.

Best regards,
{{company_name}}`,
    },
  },
  bill_created_customer: {
    label: "Bill / Order created — Customer notification",
    placeholders: [
      "{{customer_name}}",
      "{{bill_number}}",
      "{{bill_date}}",
      "{{expected_delivery_date}}",
      "{{items_list}}",
      "{{total_qty}}",
      "{{grand_total}}",
      "{{amount_due}}",
      "{{remarks}}",
      "{{company_name}}",
    ],
    defaultEmail: {
      subject: "Your order {{bill_number}} — {{company_name}}",
      body: `Dear {{customer_name}},

Thank you for your order. Your bill / order has been created successfully.

Bill number: {{bill_number}}
Date: {{bill_date}}
Expected delivery: {{expected_delivery_date}}

Items:
{{items_list}}

Total quantity: {{total_qty}}
Grand total: {{grand_total}}
Amount due: {{amount_due}}

{{remarks}}

Thank you,
{{company_name}}`,
    },
  },
};

/** Tokens available for custom-purpose templates (admin can use any of these). */
export const COMMON_PLACEHOLDERS = [
  "{{customer_name}}",
  "{{vendor_name}}",
  "{{bill_number}}",
  "{{bill_date}}",
  "{{order_number}}",
  "{{order_date}}",
  "{{items}}",
  "{{items_list}}",
  "{{bill_list}}",
  "{{total_qty}}",
  "{{grand_total}}",
  "{{total_amount}}",
  "{{amount_due}}",
  "{{total_outstanding}}",
  "{{company_name}}",
  "{{remarks}}",
  "{{expected_delivery_date}}",
];

const TOKEN_RE = /\{\{(\w+)\}\}/g;

export function slugifyPurpose(input) {
  return String(input || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
}

export function humanizePurpose(slug) {
  return String(slug || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function getPurposeLabel(purpose, templates = []) {
  if (!purpose) return "";
  if (PURPOSE_REGISTRY[purpose]?.label) return PURPOSE_REGISTRY[purpose].label;
  const row = (templates || []).find((t) => t.purpose === purpose && t.purpose_label);
  if (row?.purpose_label) return row.purpose_label;
  return humanizePurpose(purpose);
}

export function getPlaceholdersForPurpose(purpose) {
  return PURPOSE_REGISTRY[purpose]?.placeholders || COMMON_PLACEHOLDERS;
}

export function getDefaultEmailTemplate(purpose) {
  return PURPOSE_REGISTRY[purpose]?.defaultEmail || { subject: "", body: "" };
}

export function getBuiltinPurposeOptions() {
  return Object.entries(PURPOSE_REGISTRY).map(([value, meta]) => ({
    value,
    label: meta.label,
    builtin: true,
  }));
}

/** Distinct custom purposes from saved templates (not in registry). */
export function getCustomPurposeOptions(templates = []) {
  const builtins = new Set(Object.keys(PURPOSE_REGISTRY));
  const byPurpose = new Map();
  for (const t of templates || []) {
    if (!t.purpose || builtins.has(t.purpose)) continue;
    if (!byPurpose.has(t.purpose)) {
      byPurpose.set(t.purpose, {
        value: t.purpose,
        label: t.purpose_label || humanizePurpose(t.purpose),
        builtin: false,
      });
    }
  }
  return [...byPurpose.values()];
}

export function templateByPurposeChannel(list, purpose, channel) {
  return (list || []).find((t) => t.purpose === purpose && t.channel === channel) || null;
}

export function getActiveTemplate(list, purpose, channel) {
  const t = templateByPurposeChannel(list, purpose, channel);
  if (!t || t.status === "inactive") return null;
  return t;
}

/**
 * Replace {{token}} placeholders. Unknown tokens become empty string.
 * @param {string} text
 * @param {Record<string, string|number|null|undefined>} vars keys without braces
 */
export function renderTemplate(text, vars = {}) {
  if (!text) return "";
  return String(text).replace(TOKEN_RE, (_, key) => {
    const v = vars[key];
    if (v == null) return "";
    return String(v);
  });
}

export function renderCommunicationTemplate(template, vars) {
  if (!template) return { subject: "", body: "" };
  return {
    subject: renderTemplate(template.subject || "", vars),
    body: renderTemplate(template.body || "", vars),
  };
}

/**
 * @param {Array<{ item_name?: string, category?: string, quantity?: number, rate?: number, amount?: number }>} items
 * @param {object} [companySettings]
 */
export function formatBillItemsList(items, companySettings) {
  const lines = (items || []).map((i) => {
    const qty = i.quantity ?? 0;
    const rate = formatCurrencyAmount(i.rate || 0, companySettings);
    const amt = formatCurrencyAmount(i.amount || 0, companySettings);
    const cat = i.category ? ` (${i.category})` : "";
    return `• ${i.item_name || "Item"}${cat} — Qty ${qty} × ${rate} = ${amt}`;
  });
  return lines.length ? lines.join("\n") : "—";
}

/**
 * Build merge vars for bill_created_customer purpose.
 */
export function buildBillCreatedVars({ bill, items, companySettings }) {
  const settings = companySettings || {};
  const grand = bill?.total_amount ?? (items || []).reduce((s, i) => s + (i.amount || 0), 0);
  const qty = bill?.total_qty ?? (items || []).reduce((s, i) => s + (i.quantity || 0), 0);
  const remarks = (bill?.remarks || "").trim();
  return {
    customer_name: bill?.customer_name || "",
    bill_number: bill?.bill_number || "",
    bill_date: bill?.bill_date || "",
    expected_delivery_date: bill?.expected_delivery_date || "—",
    items_list: formatBillItemsList(items, settings),
    items: formatBillItemsList(items, settings),
    total_qty: String(qty),
    grand_total: formatCurrencyAmount(grand, settings),
    total_amount: formatCurrencyAmount(grand, settings),
    amount_due: formatCurrencyAmount(bill?.amount_due ?? grand, settings),
    remarks: remarks ? `Notes: ${remarks}` : "",
    company_name: settings.company_name || "COMFORT",
  };
}

export function buildPoVendorVars({ po, items, companySettings }) {
  const settings = companySettings || {};
  const totalQty = (items || []).reduce((s, i) => s + (i.quantity || 1), 0);
  const totalAmt = (items || []).reduce((s, i) => s + (i.vendor_amount || 0), 0);
  return {
    vendor_name: po?.vendor_name || "",
    order_number: po?.order_number || "",
    order_date: po?.order_date || "",
    total_qty: String(totalQty),
    total_amount: formatCurrencyAmount(totalAmt, settings),
    company_name: settings.company_name || "COMFORT",
  };
}

export function buildPaymentReminderVars({ customer, bills, companySettings }) {
  const settings = companySettings || {};
  const totalDue = (bills || []).reduce((s, b) => s + (b.amount_due || 0), 0);
  const billList = (bills || [])
    .map((b) => `- Bill #${b.bill_number}: ${formatCurrencyAmount(b.amount_due, settings)}`)
    .join("\n");
  const first = bills?.[0];
  return {
    customer_name: customer?.name || "",
    bill_number: first?.bill_number || "",
    bill_list: billList || "—",
    grand_total: formatCurrencyAmount(totalDue, settings),
    amount_due: formatCurrencyAmount(totalDue, settings),
    total_outstanding: formatCurrencyAmount(totalDue, settings),
    company_name: settings.company_name || "COMFORT",
  };
}

export function buildJobReminderVars({ vendor, billNumber, items, companySettings }) {
  const settings = companySettings || {};
  const lines = (items || []).map(
    (i) => `• ${i.item_name || "Item"} (Bill #${i.bill_number || billNumber || "—"}) — Qty ${i.quantity ?? 0}`
  );
  const totalQty = (items || []).reduce((s, i) => s + (i.quantity || 0), 0);
  const totalAmt = (items || []).reduce((s, i) => s + (i.vendor_amount || i.amount || 0), 0);
  return {
    vendor_name: vendor?.name || vendor?.vendor_name || "",
    bill_number: billNumber || "",
    items: lines.length ? lines.join("\n") : "—",
    total_qty: String(totalQty),
    total_amount: formatCurrencyAmount(totalAmt, settings),
    company_name: settings.company_name || "COMFORT",
  };
}

/**
 * Load active template and render, or fall back to provided defaults.
 */
export function resolveRenderedMessage({
  templates,
  purpose,
  channel,
  vars,
  fallbackSubject = "",
  fallbackBody = "",
}) {
  const template = getActiveTemplate(templates, purpose, channel);
  if (template) {
    return renderCommunicationTemplate(template, vars);
  }
  return {
    subject: renderTemplate(fallbackSubject, vars),
    body: renderTemplate(fallbackBody, vars),
  };
}
