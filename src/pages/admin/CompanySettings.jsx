import React, { useState, useEffect, useRef, useMemo } from "react";
import { db, uploadFile, getComfortFilesDisplayUrl } from "@/services/SupabaseService";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { usePaymentMethodsQuery } from "@/hooks/usePaymentMethodsQuery";
import { PAYMENT_METHODS_QUERY_KEY } from "@/lib/paymentMethodsQuery";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Save, Upload, Building2, Phone, Plus, Trash2, Pencil, Globe2, Palette } from "lucide-react";
import { UI_THEME_PRESETS, normalizeUiThemePreset } from "@/lib/uiThemePresets";
import { pickCompanySettingsPersistPayload } from "@/lib/companySettingsPayload";
import { CURRENCY_OPTIONS } from "@/lib/currency";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { sortByLocaleKey } from "@/lib/utils";
import { usePermissions } from "@/hooks/usePermissions";

export default function CompanySettings() {
  const qc = useQueryClient();
  const { can } = usePermissions();
  const canEditCompany = can("admin_company_settings", "edit");
  const canUploadLogo = can("admin_company_settings", "upload");
  const canDeleteCompanyItems = can("admin_company_settings", "delete");
  const { data: settings = [] } = useQuery({ queryKey: ["company-settings"], queryFn: () => db.CompanySettings.list() });
  const paymentMethodsQuery = usePaymentMethodsQuery();
  const paymentMethods = paymentMethodsQuery.data ?? [];
  const paymentMethodsListLoading =
    paymentMethodsQuery.isPending && paymentMethods.length === 0;

  const uiThemesSorted = useMemo(() => sortByLocaleKey([...UI_THEME_PRESETS], "label"), []);
  const financialYearPresetOptions = useMemo(
    () =>
      sortByLocaleKey(
        [
          { value: "april_march", label: "1 Apr - 31 Mar next year (e.g. India)" },
          { value: "jan_dec", label: "1 Jan - 31 Dec (calendar year)" },
          { value: "uk_tax", label: "6 Apr - 5 Apr next year (UK tax year)" },
          { value: "custom", label: "Custom (edit month / day)" },
        ],
        "label"
      ),
    []
  );
  const paymentMethodsSorted = useMemo(() => sortByLocaleKey(paymentMethods, "name"), [paymentMethods]);
  const [form, setForm] = useState({ company_name: 'COMFORT', logo_url: '', address: '', email: '', phone_customer_care: '', phone_office: '', phone_sales: '', payment_terms: ['Net 15', 'Net 30', 'Net 45', 'Immediate'], enable_bill_receipts: false, enable_vendor_payment_proof: false, enable_customer_payment_proof: false, financial_year_start_month: 4, financial_year_start_day: 1, display_currency_code: 'INR', ui_theme_preset: 'default' });
  const [newTerm, setNewTerm] = useState('');
  const [paymentMethodDialog, setPaymentMethodDialog] = useState(null);
  const [editingPaymentMethodId, setEditingPaymentMethodId] = useState(null);
  const [paymentMethodForm, setPaymentMethodForm] = useState({ name: '', type: 'cash' });
  /** When true, refetches must not overwrite logo_url (uploaded but not yet saved). */
  const unsavedLogoRef = useRef(false);
  /** Theme dropdown changed but not saved — revert React Query cache on unmount. */
  const themeDirtyRef = useRef(false);
  /** Last persisted company_settings row (for reverting unsaved theme preview). */
  const serverRowRef = useRef(null);
  /** Resolved URL for img src (signed when bucket is private). */
  const [resolvedLogoSrc, setResolvedLogoSrc] = useState('');

  useEffect(() => {
    if (!settings[0]) return;
    setForm((prev) => {
      const s = settings[0];
      const serverLogo = s.logo_url || '';
      const logo_url = unsavedLogoRef.current && prev.logo_url ? prev.logo_url : serverLogo;
      return {
        company_name: s.company_name || 'COMFORT',
        logo_url,
        address: s.address || '',
        email: s.email || '',
        phone_customer_care: s.phone_customer_care || '',
        phone_office: s.phone_office || '',
        phone_sales: s.phone_sales || '',
        payment_terms: s.payment_terms || ['Net 15', 'Net 30', 'Net 45', 'Immediate'],
        enable_bill_receipts: s.enable_bill_receipts || false,
        enable_vendor_payment_proof: s.enable_vendor_payment_proof || false,
        enable_customer_payment_proof: s.enable_customer_payment_proof || false,
        financial_year_start_month: Number(s.financial_year_start_month) > 0 ? Number(s.financial_year_start_month) : 4,
        financial_year_start_day: Number(s.financial_year_start_day) > 0 ? Number(s.financial_year_start_day) : 1,
        display_currency_code: (() => {
          const c = s.display_currency_code;
          if (c == null || String(c).trim() === '') return 'INR';
          return String(c).trim().toUpperCase();
        })(),
        ui_theme_preset: themeDirtyRef.current
          ? normalizeUiThemePreset(prev.ui_theme_preset)
          : normalizeUiThemePreset(s.ui_theme_preset),
      };
    });
  }, [settings]);

  useEffect(() => {
    if (!themeDirtyRef.current && settings[0]) {
      serverRowRef.current = { ...settings[0] };
    }
  }, [settings]);

  useEffect(() => {
    return () => {
      if (!themeDirtyRef.current) return;
      themeDirtyRef.current = false;
      if (serverRowRef.current) {
        qc.setQueryData(["company-settings"], [serverRowRef.current]);
      } else {
        qc.invalidateQueries({ queryKey: ["company-settings"] });
      }
    };
  }, [qc]);

  useEffect(() => {
    const u = form.logo_url;
    if (!u) {
      setResolvedLogoSrc('');
      return;
    }
    if (u.startsWith('blob:') || u.startsWith('data:')) {
      setResolvedLogoSrc(u);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const resolved = await getComfortFilesDisplayUrl(u);
        if (!cancelled) setResolvedLogoSrc(resolved || u);
      } catch {
        if (!cancelled) setResolvedLogoSrc(u);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [form.logo_url]);

  const saveMutation = useMutation({
    mutationFn: (data) => {
      const row = settings[0];
      const payload = pickCompanySettingsPersistPayload(data, row ?? null);
      return row ? db.CompanySettings.update(row.id, payload) : db.CompanySettings.create(payload);
    },
    onSuccess: (saved) => {
      unsavedLogoRef.current = false;
      themeDirtyRef.current = false;
      if (saved) {
        qc.setQueryData(["company-settings"], [saved]);
        serverRowRef.current = { ...saved };
      }
      qc.invalidateQueries({ queryKey: ["company-settings"] });
      toast.success("Settings saved");
    },
    onError: (err) => {
      toast.error(
        err?.message ||
          "Could not save settings. Apply pending Supabase migrations (company_settings columns) or run SQL from supabase/migrations."
      );
    },
  });

  const handleLogoUpload = async (e) => {
    if (!canUploadLogo) return;
    const file = e.target.files[0];
    if (!file) return;
    const blobPreview = URL.createObjectURL(file);
    unsavedLogoRef.current = true;
    setForm((f) => ({ ...f, logo_url: blobPreview }));
    try {
      const { file_url } = await uploadFile(file);
      URL.revokeObjectURL(blobPreview);
      setForm((f) => ({ ...f, logo_url: file_url }));
      toast.success("Logo uploaded — click Save Settings to keep it");
    } catch (err) {
      URL.revokeObjectURL(blobPreview);
      unsavedLogoRef.current = false;
      setForm((f) => ({ ...f, logo_url: settings[0]?.logo_url || '' }));
      toast.error(err?.message || "Logo upload failed");
    }
    e.target.value = "";
  };

  const addPaymentTerm = () => { if (newTerm && !form.payment_terms.includes(newTerm)) { setForm(f => ({ ...f, payment_terms: [...f.payment_terms, newTerm] })); setNewTerm(''); } };
  const removePaymentTerm = (term) => setForm(f => ({ ...f, payment_terms: f.payment_terms.filter(t => t !== term) }));

  const savePaymentMethodMutation = useMutation({
    mutationFn: async (data) => {
      const editingId = editingPaymentMethodId;
      const name = String(data.name || "").trim();
      if (!name) throw new Error("Name is required");
      const list = qc.getQueryData(PAYMENT_METHODS_QUERY_KEY) || [];
      const dup = list.some(
        (m) =>
          String(m.name || "").trim().toLowerCase() === name.toLowerCase() &&
          m.id !== editingId
      );
      if (dup) throw new Error("A payment method with this name already exists.");
      return editingId ? db.PaymentMethod.update(editingId, data) : db.PaymentMethod.create(data);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PAYMENT_METHODS_QUERY_KEY });
      setPaymentMethodDialog(false);
      setEditingPaymentMethodId(null);
      setPaymentMethodForm({ name: "", type: "cash" });
      toast.success("Payment method saved");
    },
    onError: (err) => {
      toast.error(err?.message || "Could not save payment method");
    },
  });

  const deletePaymentMethodMutation = useMutation({
    mutationFn: (id) => db.PaymentMethod.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PAYMENT_METHODS_QUERY_KEY });
      toast.success("Deleted");
    },
  });

  const openPaymentMethodDialog = (method = null) => {
    if (method) { setEditingPaymentMethodId(method.id); setPaymentMethodForm({ name: method.name, type: method.type }); }
    else { setEditingPaymentMethodId(null); setPaymentMethodForm({ name: '', type: 'cash' }); }
    setPaymentMethodDialog(true);
  };

  return (
    <div>
      <PageHeader title="Company Settings" subtitle="Configure your business details" permissionResource="admin_company_settings" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-5xl">
        <Card className="border-0 shadow-sm">
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Building2 className="w-4 h-4" /> Company Details</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div><Label>Company Name</Label><Input value={form.company_name} onChange={e => setForm({ ...form, company_name: e.target.value })} /></div>
            <div>
              <Label>Logo</Label>
              <div className="flex items-center gap-3">
                {(resolvedLogoSrc || form.logo_url) && (
                  <img
                    src={resolvedLogoSrc || form.logo_url}
                    alt="Logo"
                    className="w-16 h-16 object-contain rounded-lg border bg-muted/30"
                  />
                )}
                {canUploadLogo ? (
                  <label className="cursor-pointer"><input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" /><Button variant="outline" size="sm" asChild><span><Upload className="w-3.5 h-3.5 mr-1" /> Upload Logo</span></Button></label>
                ) : (
                  <p className="text-xs text-muted-foreground">Logo upload is not allowed for your role.</p>
                )}
              </div>
            </div>
            <div><Label>Address</Label><Input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} /></div>
            <div><Label>Email</Label><Input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Phone className="w-4 h-4" /> Contact Information</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div><Label>Customer Care (WhatsApp)</Label><Input placeholder="+91 XXXXX XXXXX" value={form.phone_customer_care} onChange={e => setForm({ ...form, phone_customer_care: e.target.value })} /></div>
            <div><Label>Office</Label><Input placeholder="+91 XXXXX XXXXX" value={form.phone_office} onChange={e => setForm({ ...form, phone_office: e.target.value })} /></div>
            <div><Label>Sales</Label><Input placeholder="+91 XXXXX XXXXX" value={form.phone_sales} onChange={e => setForm({ ...form, phone_sales: e.target.value })} /></div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Palette className="w-4 h-4" />
              Appearance &amp; theme
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 max-w-2xl">
            <p className="text-xs text-muted-foreground">
              Picking a theme updates the app colours immediately (preview). Click <strong>Save Settings</strong> to store
              it for everyone. Leaving this page without saving reverts the preview.
            </p>
            <div>
              <Label className="text-xs">Site theme</Label>
              <Select
                value={normalizeUiThemePreset(form.ui_theme_preset)}
                onValueChange={(id) => {
                  const next = normalizeUiThemePreset(id);
                  themeDirtyRef.current = true;
                  setForm((f) => ({ ...f, ui_theme_preset: next }));
                  qc.setQueryData(["company-settings"], (old) => {
                    const row = old?.[0];
                    if (!row) return old;
                    return [{ ...row, ui_theme_preset: next }];
                  });
                }}
              >
                <SelectTrigger className="h-9 mt-1.5 max-w-md">
                  <SelectValue placeholder="Select theme" />
                </SelectTrigger>
                <SelectContent className="max-w-md">
                  {uiThemesSorted.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-2 max-w-lg">
                {UI_THEME_PRESETS.find((p) => p.id === normalizeUiThemePreset(form.ui_theme_preset))?.description}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Globe2 className="w-4 h-4" />
              Regional & financial settings
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-8">
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-foreground">Financial year (FY)</h3>
              <p className="text-xs text-muted-foreground max-w-3xl">
                Reports show which FY a date falls in. Set the first day of each financial year; the FY ends the day before that date in the following calendar year (e.g. 1 Apr 2025 starts an FY that ends 31 Mar 2026).
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-xl">
                <div>
                  <Label className="text-xs">Quick preset</Label>
                  <Select
                    value={(() => {
                      const m = Number(form.financial_year_start_month);
                      const d = Number(form.financial_year_start_day);
                      if (m === 4 && d === 1) return "april_march";
                      if (m === 1 && d === 1) return "jan_dec";
                      if (m === 4 && d === 6) return "uk_tax";
                      return "custom";
                    })()}
                    onValueChange={(v) => {
                      if (v === "april_march") setForm((f) => ({ ...f, financial_year_start_month: 4, financial_year_start_day: 1 }));
                      else if (v === "jan_dec") setForm((f) => ({ ...f, financial_year_start_month: 1, financial_year_start_day: 1 }));
                      else if (v === "uk_tax") setForm((f) => ({ ...f, financial_year_start_month: 4, financial_year_start_day: 6 }));
                    }}
                  >
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {financialYearPresetOptions.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Start month (1-12)</Label>
                    <Input
                      type="number"
                      min={1}
                      max={12}
                      className="h-9"
                      value={form.financial_year_start_month}
                      onChange={(e) => setForm({ ...form, financial_year_start_month: Math.min(12, Math.max(1, Number(e.target.value) || 1)) })}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Start day (1-31)</Label>
                    <Input
                      type="number"
                      min={1}
                      max={31}
                      className="h-9"
                      value={form.financial_year_start_day}
                      onChange={(e) => setForm({ ...form, financial_year_start_day: Math.min(31, Math.max(1, Number(e.target.value) || 1)) })}
                    />
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm lg:col-span-2">
          <CardHeader><CardTitle className="text-sm">Display currency</CardTitle></CardHeader>
          <CardContent className="space-y-3 max-w-xl">
            <p className="text-xs text-muted-foreground">
              Amounts across the app (tables, reports, exports, PDFs, sidebar salary icons) use this symbol and number format.
            </p>
            <div>
              <Label className="text-xs">Currency</Label>
              <Select
                value={CURRENCY_OPTIONS.some((o) => o.code === form.display_currency_code) ? form.display_currency_code : "INR"}
                onValueChange={(code) => setForm((f) => ({ ...f, display_currency_code: code }))}
              >
                <SelectTrigger className="h-9 mt-1.5"><SelectValue placeholder="Select currency" /></SelectTrigger>
                <SelectContent className="max-h-72">
                  {CURRENCY_OPTIONS.map((o) => (
                    <SelectItem key={o.code} value={o.code}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardHeader><CardTitle className="text-sm">Feature Toggles</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between"><Label className="text-sm">Enable Bill Receipts</Label><Switch checked={form.enable_bill_receipts} onCheckedChange={v => setForm({ ...form, enable_bill_receipts: v })} /></div>
            <div className="flex items-center justify-between"><Label className="text-sm">Enable Vendor Payment Proof</Label><Switch checked={form.enable_vendor_payment_proof} onCheckedChange={v => setForm({ ...form, enable_vendor_payment_proof: v })} /></div>
            <div className="flex items-center justify-between"><Label className="text-sm">Enable Customer Payment Proof</Label><Switch checked={form.enable_customer_payment_proof} onCheckedChange={v => setForm({ ...form, enable_customer_payment_proof: v })} /></div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardHeader><CardTitle className="text-sm">Payment Terms</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2 mb-3">
              {form.payment_terms.map(t => (
                <div key={t} className="flex items-center gap-1 px-3 py-1 bg-muted rounded-full text-sm">
                  {t}<button onClick={() => removePaymentTerm(t)} className="text-muted-foreground hover:text-destructive"><Trash2 className="w-3 h-3" /></button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Input placeholder="New term..." value={newTerm} onChange={e => setNewTerm(e.target.value)} className="h-9" />
              <Button size="sm" variant="outline" onClick={addPaymentTerm}><Plus className="w-4 h-4" /></Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardHeader><CardTitle className="text-sm flex items-center justify-between">Payment Methods <Button size="sm" variant="outline" className="gap-1 h-8" onClick={() => openPaymentMethodDialog()}><Plus className="w-3.5 h-3.5" /> Add</Button></CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {paymentMethodsListLoading ? (
                <p className="text-xs text-muted-foreground">Loading payment methods…</p>
              ) : paymentMethods.length === 0 ? (
                <p className="text-xs text-muted-foreground">No payment methods configured</p>
              ) : (
                paymentMethodsSorted.map((m) => (
                  <div key={m.id} className="flex items-center justify-between p-2 bg-muted/50 rounded-lg text-sm">
                    <div>
                      <span className="font-medium">{m.name}</span>
                      <span className="text-xs text-muted-foreground ml-2">({m.type === "cash" ? "Cash" : "Bank"})</span>
                    </div>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" className="h-7 w-7" onClick={() => openPaymentMethodDialog(m)}>
                        <Pencil className="w-3 h-3" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 text-destructive"
                        onClick={() => deletePaymentMethodMutation.mutate(m.id)}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-6"><Button onClick={() => saveMutation.mutate(form)} className="gap-2" disabled={!canEditCompany}><Save className="w-4 h-4" /> Save Settings</Button></div>

      <Dialog open={paymentMethodDialog} onOpenChange={setPaymentMethodDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{editingPaymentMethodId ? "Edit" : "Add"} Payment Method</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-2">
            <div><Label>Method Name *</Label><Input value={paymentMethodForm.name} onChange={e => setPaymentMethodForm({ ...paymentMethodForm, name: e.target.value })} placeholder="e.g., Cash, Bank Transfer, Cheque" /></div>
            <div><Label>Type *</Label><Select value={paymentMethodForm.type} onValueChange={v => setPaymentMethodForm({ ...paymentMethodForm, type: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="bank">Bank</SelectItem><SelectItem value="cash">Cash</SelectItem></SelectContent></Select></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentMethodDialog(false)}>Cancel</Button>
            <Button onClick={() => { if (!paymentMethodForm.name) { toast.error("Name required"); return; } savePaymentMethodMutation.mutate(paymentMethodForm); }} disabled={savePaymentMethodMutation.isPending}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}