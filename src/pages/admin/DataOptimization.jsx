import React, { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/api/supabaseClient";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertCircle, Trash2, Settings, FileText, Database, Download, Upload, Gauge } from "lucide-react";
import { toast } from "sonner";
import ConfirmModal from "@/components/shared/ConfirmModal";
import { exportTransactionBackup, importTransactionBackup } from "@/lib/dataBackupRestore";

export default function DataOptimization() {
  const [tab, setTab] = useState("retention");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [dateFrom, setDateFrom] = useState("");   // blank by default — compulsory
  const [dateTo, setDateTo] = useState("");         // blank by default — compulsory
  const [retentionEnabled, setRetentionEnabled] = useState(false);
  const [retentionAge, setRetentionAge] = useState(5);

  const [backupFrom, setBackupFrom] = useState("");
  const [backupTo, setBackupTo] = useState("");
  const [includeMasterBackup, setIncludeMasterBackup] = useState(false);
  const [includeExtendedPublicBackup, setIncludeExtendedPublicBackup] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [confirmImport, setConfirmImport] = useState(false);
  const [pendingImportPayload, setPendingImportPayload] = useState(null);
  const importFileRef = useRef(null);

  const optimizeMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("optimize_app_tables");
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      let parsed = data;
      if (typeof data === "string") {
        try {
          parsed = JSON.parse(data);
        } catch {
          parsed = null;
        }
      }
      if (!parsed || typeof parsed !== "object") {
        toast.success("ANALYZE completed.");
        return;
      }

      let ok = 0;
      let skipped = 0;
      let errors = 0;
      if (parsed.summary && typeof parsed.summary === "object") {
        ok = Number(parsed.summary.ok) || 0;
        skipped = Number(parsed.summary.skipped) || 0;
        errors = Number(parsed.summary.errors) || 0;
      } else {
        for (const v of Object.values(parsed)) {
          if (v === "ok") ok += 1;
          else if (v === "skipped") skipped += 1;
          else if (typeof v === "string" && v.startsWith("error:")) errors += 1;
        }
      }

      const title = `ANALYZE finished: ${ok} table(s) updated${
        skipped ? ` · ${skipped} name(s) skipped (not in database)` : ""
      }${errors ? ` · ${errors} error(s)` : ""}.`;

      const description =
        errors > 0
          ? "Check the Supabase SQL Editor or logs for tables that returned an error."
          : skipped > 0
            ? "Skipped names are alternate spellings (e.g. customer vs customers) that do not exist in your schema. Your real tables are still analyzed under the names that do exist."
            : undefined;

      toast.success(title, description ? { description } : undefined);
    },
    onError: (err) => {
      const msg = err?.message || String(err);
      if (/function .* does not exist|schema cache/i.test(msg)) {
        toast.error(
          "The optimize function is not installed yet. Run the SQL migration optimize_app_tables in your Supabase project (see supabase/migrations)."
        );
      } else {
        toast.error(msg);
      }
    },
  });

  const importBackupMutation = useMutation({
    mutationFn: (payload) => importTransactionBackup(payload),
    onSuccess: (summary) => {
      const n = summary.filter((s) => !s.skipped).reduce((a, s) => a + s.count, 0);
      toast.success(`Import finished. ${n} row(s) upserted across tables.`);
      setConfirmImport(false);
      setPendingImportPayload(null);
      if (importFileRef.current) importFileRef.current.value = "";
    },
    onError: (err) => toast.error(err?.message || "Import failed"),
  });

  const deleteTransactionsMutation = useMutation({
    mutationFn: async () => {
      // Delete all transaction records in date range
      const tables = [
        { table: 'bill_items', dateField: 'created_date' },
        { table: 'payment_collections', dateField: 'date' },
        { table: 'vendor_billings', dateField: 'date' },
        { table: 'vendor_orders', dateField: 'order_date' },
        { table: 'expenses', dateField: 'date' },
        { table: 'salary_records', dateField: 'created_date' },
        { table: 'bills', dateField: 'bill_date' },
      ];
      let total = 0;
      for (const { table, dateField } of tables) {
        const { data, error } = await supabase.from(table).delete()
          .gte(dateField, dateFrom).lte(dateField, dateTo).select('id');
        if (!error) total += (data || []).length;
      }
      return { total };
    },
    onSuccess: (result) => {
      toast.success(`Deleted ${result.total} transaction records.`);
      setConfirmDelete(false);
      setDateFrom('');
      setDateTo('');
    },
    onError: (err) => toast.error(`Error: ${err.message}`),
  });

  const runExportBackup = async () => {
    if (!backupFrom || !backupTo) {
      toast.error("Select both From and To dates for the backup range.");
      return;
    }
    if (backupFrom > backupTo) {
      toast.error("From Date cannot be after To Date.");
      return;
    }
    setExporting(true);
    try {
      const payload = await exportTransactionBackup(backupFrom, backupTo, {
        includeMasterData: includeMasterBackup,
        includeExtendedPublicData: includeExtendedPublicBackup,
      });
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ComfortLaundry_backup_${backupFrom}_${backupTo}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      const counts = Object.entries(payload.tables || {})
        .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.length : 0}`)
        .join(", ");
      const extra =
        payload.profilesExportNote && includeExtendedPublicBackup
          ? ` Note: ${payload.profilesExportNote}`
          : "";
      toast.success(`Backup downloaded (${counts}).${extra}`);
    } catch (e) {
      toast.error(e?.message || "Export failed");
    } finally {
      setExporting(false);
    }
  };

  const readImportFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      setPendingImportPayload(payload);
      setConfirmImport(true);
    } catch (err) {
      toast.error("Could not read backup file. Use a JSON export from this screen.");
      e.target.value = "";
    }
  };

  return (
    <div>
      <PageHeader title="Data Optimization" subtitle="Manage data retention, storage, and performance" />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="retention" className="gap-2">
            <Settings className="w-4 h-4" /> Retention Policies
          </TabsTrigger>
          {/* Manual Delete is now 2nd — between Retention & Content */}
          <TabsTrigger value="manual_delete" className="gap-2">
            <Trash2 className="w-4 h-4" /> Manual Delete
          </TabsTrigger>
          <TabsTrigger value="assets" className="gap-2">
            <FileText className="w-4 h-4" /> Content Management
          </TabsTrigger>
          <TabsTrigger value="database" className="gap-2">
            <Database className="w-4 h-4" /> Database
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Retention Policies */}
        <TabsContent value="retention">
          <Card>
            <CardHeader>
              <CardTitle>Automatic Data Retention Policy</CardTitle>
              <CardDescription>Automatically delete transaction records older than the specified age.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                <div>
                  <Label className="text-base font-semibold">Enable Automatic Retention Policy</Label>
                  <p className="text-sm text-muted-foreground mt-1">Auto-delete old transaction records</p>
                </div>
                <Switch checked={retentionEnabled} onCheckedChange={setRetentionEnabled} />
              </div>
              {retentionEnabled && (
                <div>
                  <Label>Delete Records Older Than (Years)</Label>
                  <div className="flex items-center gap-2 mt-2">
                    <Input type="number" min={1} max={20} value={retentionAge}
                      onChange={e => setRetentionAge(Number(e.target.value))} className="w-24" />
                    <span className="text-sm text-muted-foreground">
                      Transactions older than <strong>{retentionAge} year(s)</strong> will be deleted
                    </span>
                  </div>
                </div>
              )}
              <Button onClick={() => toast.info("In standalone mode, set up a Supabase scheduled function (pg_cron) for retention policies.")}>
                {retentionEnabled ? "Enable" : "Disable"} Retention Policy
              </Button>
              <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">
                <strong>Note:</strong> In standalone mode, implement retention via Supabase pg_cron or Edge Functions.
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2: Manual Delete — blank dates by default, compulsory, confirm popup */}
        <TabsContent value="manual_delete">
          <Card className="border-red-200 bg-red-50/30">
            <CardHeader>
              <CardTitle className="text-red-700">Delete Transactions by Date Range</CardTitle>
              <CardDescription>
                Permanently delete all transaction records (Bills, Payments, Expenses, etc.) within a date range. Master data is not affected.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-amber-100 border border-amber-300 rounded-lg p-3 flex gap-3">
                <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-amber-700">
                  This action is <strong>permanent and irreversible</strong>. Ensure you have a backup before proceeding.
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>From Date <span className="text-destructive">*</span></Label>
                  <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
                </div>
                <div>
                  <Label>To Date <span className="text-destructive">*</span></Label>
                  <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
                </div>
              </div>

              {dateFrom && dateTo && (
                <div className="text-sm text-muted-foreground">
                  Will delete all transactions between <strong>{dateFrom}</strong> and <strong>{dateTo}</strong>
                </div>
              )}

              <Button
                variant="destructive"
                onClick={() => {
                  if (!dateFrom || !dateTo) {
                    toast.error("Please select both From Date and To Date before deleting");
                    return;
                  }
                  if (dateFrom > dateTo) {
                    toast.error("From Date cannot be after To Date");
                    return;
                  }
                  setConfirmDelete(true);   // opens re-confirm popup
                }}
                disabled={deleteTransactionsMutation.isPending}
                className="w-full"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete Transactions in Date Range
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 3: Content Management */}
        <TabsContent value="assets">
          <Card>
            <CardHeader>
              <CardTitle>Content Management - Unused Files</CardTitle>
              <CardDescription>Identify and delete unused files to free up storage space.</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                In standalone mode, manage file storage directly via your Supabase Storage dashboard or implement a custom scan using Supabase Storage API.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="database" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Gauge className="w-5 h-5" /> Optimize database tables
              </CardTitle>
              <CardDescription>
                Runs <strong>ANALYZE</strong> on core application tables so PostgreSQL can plan queries efficiently. This
                does not rebuild indexes or run <code className="text-xs">VACUUM</code> (use Supabase maintenance or SQL
                editor for that). Requires the <code className="text-xs">optimize_app_tables</code> function in your
                database (install once using the steps below).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button onClick={() => optimizeMutation.mutate()} disabled={optimizeMutation.isPending} className="gap-2">
                <Gauge className="w-4 h-4" />
                {optimizeMutation.isPending ? "Running…" : "Run ANALYZE on tables"}
              </Button>
              <div className="rounded-lg border bg-muted/40 p-4 text-sm space-y-2">
                <p className="font-medium text-foreground">Install the optimize function (one-time)</p>
                <ol className="list-decimal pl-5 space-y-1.5 text-muted-foreground">
                  <li>
                    Open{" "}
                    <a
                      href="https://supabase.com/dashboard"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary underline underline-offset-2"
                    >
                      Supabase Dashboard
                    </a>{" "}
                    and select your project.
                  </li>
                  <li>
                    Open <strong>SQL Editor</strong> in the left sidebar, then click <strong>New query</strong>.
                  </li>
                  <li>
                    In your Comfort Laundry project folder, open the latest optimize migration file, for example{" "}
                    <code className="rounded bg-background px-1 py-0.5 text-xs">
                      supabase/migrations/20260513100000_optimize_app_tables_v2.sql
                    </code>
                    (or run migrations in order). Copy <strong>all</strong> of its contents, paste into the SQL editor,
                    and click <strong>Run</strong>. You should see a success message.
                  </li>
                  <li>Return here and press &quot;Run ANALYZE on tables&quot; again.</li>
                </ol>
                <p className="text-muted-foreground pt-1 border-t border-border/60">
                  <strong>Alternative (CLI):</strong> if the{" "}
                  <a
                    href="https://supabase.com/docs/guides/cli/getting-started"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline underline-offset-2"
                  >
                    Supabase CLI
                  </a>{" "}
                  is installed and linked to this project, run{" "}
                  <code className="rounded bg-background px-1 py-0.5 text-xs">supabase db push</code> from the repo root
                  to apply every migration under <code className="text-xs">supabase/migrations/</code>.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Download className="w-5 h-5" /> Export backup (date range)
              </CardTitle>
              <CardDescription>
                Downloads a JSON snapshot of <strong>public</strong> application tables (same date filters as
                transactions where each table has a suitable column). This is <strong>not</strong> a native{" "}
                <code className="text-xs">pg_dump</code> file and does <strong>not</strong> include Supabase{" "}
                <code className="text-xs">auth.users</code> (passwords, MFA, sessions). For a full database clone use
                Supabase Dashboard backups or CLI <code className="text-xs">pg_dump</code> with your database password.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>From date</Label>
                  <Input type="date" value={backupFrom} onChange={(e) => setBackupFrom(e.target.value)} />
                </div>
                <div>
                  <Label>To date</Label>
                  <Input type="date" value={backupTo} onChange={(e) => setBackupTo(e.target.value)} />
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-lg border p-3">
                <Checkbox
                  id="include-master-backup"
                  checked={includeMasterBackup}
                  onCheckedChange={(v) => setIncludeMasterBackup(v === true)}
                  className="mt-0.5"
                />
                <div>
                  <Label htmlFor="include-master-backup" className="cursor-pointer font-medium leading-none">
                    Include master / reference data
                  </Label>
                  <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                    Exports all rows from: company settings, roles, expense categories, payment methods, rate list items,
                    incentive slabs, communication templates, customers, employees, vendors, and vendor rates (not filtered
                    by the dates above). Import restores these tables first, then transactions.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-lg border p-3">
                <Checkbox
                  id="include-extended-public-backup"
                  checked={includeExtendedPublicBackup}
                  onCheckedChange={(v) => setIncludeExtendedPublicBackup(v === true)}
                  className="mt-0.5"
                />
                <div>
                  <Label htmlFor="include-extended-public-backup" className="cursor-pointer font-medium leading-none">
                    Include profiles, invitations, reminders &amp; trash (same date range)
                  </Label>
                  <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                    Adds <code className="text-xs">public.profiles</code> (filtered by{" "}
                    <code className="text-xs">updated_at</code> or <code className="text-xs">created_at</code> when those
                    columns exist; otherwise every profile row), <code className="text-xs">invitations</code> by{" "}
                    <code className="text-xs">created_date</code>, <code className="text-xs">reminder_logs</code> by{" "}
                    <code className="text-xs">sent_date</code>, and <code className="text-xs">trash_items</code> by{" "}
                    <code className="text-xs">deleted_date</code>. Import upserts these like other tables; restoring
                    logins still requires valid Auth users in Supabase Auth.
                  </p>
                </div>
              </div>
              <Button variant="outline" className="gap-2" onClick={runExportBackup} disabled={exporting}>
                <Download className="w-4 h-4" />
                {exporting ? "Exporting…" : "Download JSON backup"}
              </Button>
            </CardContent>
          </Card>

          <Card className="border-amber-200/80 bg-amber-50/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-amber-950">
                <Upload className="w-5 h-5" /> Import backup
              </CardTitle>
              <CardDescription>
                Restores rows from a JSON file produced here. Rows are <strong>upserted by primary key</strong> — existing
                rows with the same IDs are overwritten. Import order: master reference tables, then invitations and
                profiles (if present), then transactions, then reminder logs and trash archive. Older backups without
                optional sections skip those tables.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <input ref={importFileRef} type="file" accept=".json,application/json" className="hidden" onChange={readImportFile} />
              <Button
                type="button"
                variant="outline"
                className="gap-2"
                onClick={() => importFileRef.current?.click()}
                disabled={importBackupMutation.isPending}
              >
                <Upload className="w-4 h-4" />
                Choose backup JSON…
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Re-confirm popup — prevents accidental deletion */}
      <ConfirmModal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => deleteTransactionsMutation.mutate()}
        title="⚠️ Confirm Permanent Deletion"
        description={`You are about to PERMANENTLY delete ALL transaction records between ${dateFrom} and ${dateTo}. This cannot be undone. Are you absolutely sure?`}
        confirmText="Yes, Delete Permanently"
        destructive
        loading={deleteTransactionsMutation.isPending}
      />

      <ConfirmModal
        open={confirmImport}
        onClose={() => {
          setConfirmImport(false);
          setPendingImportPayload(null);
          if (importFileRef.current) importFileRef.current.value = "";
        }}
        onConfirm={() => pendingImportPayload && importBackupMutation.mutate(pendingImportPayload)}
        title="Import database backup?"
        description="This will upsert rows from the file into your live database. Rows with matching IDs will be replaced. Make sure this file is trusted and you have a separate backup if needed."
        confirmText="Yes, import now"
        destructive
        loading={importBackupMutation.isPending}
      />
    </div>
  );
}