import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { AlertCircle, Trash2, Settings, FileText } from "lucide-react";
import { toast } from "sonner";
import ConfirmModal from "@/components/shared/ConfirmModal";

export default function DataOptimization() {
  const qc = useQueryClient();
  const [tab, setTab] = useState("retention");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [dateFrom, setDateFrom] = useState(""); // blank by default — compulsory
  const [dateTo, setDateTo] = useState("");     // blank by default — compulsory
  const [retentionEnabled, setRetentionEnabled] = useState(false);
  const [retentionAge, setRetentionAge] = useState(5);

  const deleteTransactionsMutation = useMutation({
    mutationFn: async () => {
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
                    <Input
                      type="number"
                      min={1}
                      max={20}
                      value={retentionAge}
                      onChange={e => setRetentionAge(Number(e.target.value))}
                      className="w-24"
                    />
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
                  setConfirmDelete(true);
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
      </Tabs>

      <ConfirmModal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => deleteTransactionsMutation.mutate()}
        title="⚠️ Confirm Permanent Deletion"
        description={`You are about to PERMANENTLY delete ALL transaction records between ${dateFrom} and ${dateTo}. This cannot be undone. Are you absolutely sure?`}
        confirmText="Yes, Delete Permanently"
        destructive
      />
    </div>
  );
}
