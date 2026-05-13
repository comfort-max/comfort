import React, { useState, useEffect } from "react";
import { db } from "@/services/SupabaseService";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import PageHeader from "@/components/shared/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Mail, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function EmailSettings() {
  const qc = useQueryClient();
  const [fromName, setFromName] = useState('');
  const [savingFromName, setSavingFromName] = useState(false);
  const [testEmail, setTestEmail] = useState('');
  const [sendingTest, setSendingTest] = useState(false);

  const { data: companySettingsList = [] } = useQuery({ queryKey: ['company-settings'], queryFn: () => db.CompanySettings.list() });
  const companyName = companySettingsList[0]?.company_name || 'COMFORT';

  useEffect(() => {
    if (companySettingsList.length > 0) setFromName(companySettingsList[0].email_from_name || companySettingsList[0].company_name || '');
  }, [companySettingsList]);

  const handleSaveFromName = async () => {
    setSavingFromName(true);
    const settings = companySettingsList[0];
    if (settings) await db.CompanySettings.update(settings.id, { email_from_name: fromName });
    else await db.CompanySettings.create({ company_name: 'COMFORT', email_from_name: fromName });
    qc.invalidateQueries({ queryKey: ['company-settings'] });
    toast.success('From name saved');
    setSavingFromName(false);
  };

  const handleSendTest = async () => {
    if (!testEmail) { toast.error("Enter an email address"); return; }
    setSendingTest(true);
    try {
      const res = await fetch('/api/email/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(import.meta.env.VITE_SERVER_SECRET
            ? { 'x-server-secret': import.meta.env.VITE_SERVER_SECRET }
            : {}),
        },
        body: JSON.stringify({
          to: testEmail,
          subject: `${companyName} — Test email`,
          body: `This is a test email from ${companyName} Laundry Management System.\n\nIf the inbox shows a different "from" address, set EMAIL_FROM_ADDRESS in server env to the same Gmail account you use for EMAIL_USER (or configure Gmail "Send mail as").`,
          fromName: fromName || companyName,
        }),
      });
      if (res.ok) toast.success("Test email sent!");
      else toast.error("Failed to send test email. Check server logs.");
    } catch (err) {
      toast.error("Failed: " + err.message);
    } finally {
      setSendingTest(false);
    }
  };

  return (
    <div>
      <PageHeader title="Email Settings" subtitle="Configure email sending via SMTP" />
      <div className="space-y-6 max-w-2xl">
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Mail className="w-5 h-5" /> Email Configuration</CardTitle>
            <CardDescription>Email is sent via the Node.js email server using Gmail SMTP. Configure credentials in your .env file.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 rounded-lg bg-muted/50 text-sm space-y-2">
              <p className="font-medium">Server configuration (.env or Vercel env):</p>
              <code className="block text-xs text-muted-foreground whitespace-pre-wrap">{`EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=comfort@gmail.com
EMAIL_PASS=app-password
EMAIL_FROM_NAME=COMFORT
EMAIL_FROM_ADDRESS=comfort@gmail.com
EMAIL_REPLY_TO=comfort@gmail.com
SUPABASE_SERVICE_ROLE_KEY=... (invitations only; never expose to client)
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=...`}</code>
              <p className="text-xs text-muted-foreground">
                Gmail shows the authenticated account in some clients. Use the <strong>same</strong> address for{" "}
                <code className="text-xs">EMAIL_USER</code> and <code className="text-xs">EMAIL_FROM_ADDRESS</code> unless
                you have Google Workspace &quot;Send mail as&quot; configured.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardHeader><CardTitle className="text-sm">Email From Name</CardTitle><CardDescription>Display name recipients see in their inbox.</CardDescription></CardHeader>
          <CardContent>
            <div className="flex gap-3 items-end">
              <div className="flex-1"><Label className="text-sm mb-1.5 block">From Name</Label><Input value={fromName} onChange={e => setFromName(e.target.value)} placeholder="e.g. COMFORT Laundry" /></div>
              <Button onClick={handleSaveFromName} disabled={savingFromName}>{savingFromName ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}</Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardHeader><CardTitle className="text-sm">Send Test Email</CardTitle><CardDescription>Verify your email server is working correctly.</CardDescription></CardHeader>
          <CardContent>
            <div className="flex gap-3 items-end">
              <div className="flex-1"><Label className="text-sm mb-1.5 block">Send test to</Label><Input value={testEmail} onChange={e => setTestEmail(e.target.value)} placeholder="test@example.com" type="email" /></div>
              <Button onClick={handleSendTest} disabled={sendingTest}>{sendingTest ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Send Test'}</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}