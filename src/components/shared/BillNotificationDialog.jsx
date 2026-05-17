import React, { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { db, sendEmail } from "@/services/SupabaseService";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Mail, MessageSquare, Eye } from "lucide-react";
import { toast } from "sonner";
import { buildWhatsappMeUrl } from "@/lib/whatsappLink";
import {
  buildBillCreatedVars,
  getDefaultEmailTemplate,
  resolveRenderedMessage,
} from "@/lib/communicationTemplate";
import EmailPreviewDialog from "@/components/shared/EmailPreviewDialog";

const PURPOSE = "bill_created_customer";

/**
 * Send bill/order confirmation to customer via email or WhatsApp (template-driven).
 */
export default function BillNotificationDialog({
  open,
  onOpenChange,
  bill,
  items = [],
  customer,
  companySettings,
  /** 'email' | 'whatsapp' — which tab to show first when opened */
  initialChannel = "email",
  /** When false, dialog is view-only (no send / WhatsApp). */
  canSend = true,
}) {
  const [channel, setChannel] = useState(initialChannel);
  const [emailTo, setEmailTo] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [whatsappBody, setWhatsappBody] = useState("");
  const [emailPreview, setEmailPreview] = useState(false);

  const { data: templates = [] } = useQuery({
    queryKey: ["communication-templates"],
    queryFn: () => db.CommunicationTemplate.list(),
    staleTime: 5 * 60 * 1000,
    enabled: open,
  });

  const vars = useMemo(
    () => buildBillCreatedVars({ bill, items, companySettings }),
    [bill, items, companySettings]
  );

  const fallback = useMemo(() => getDefaultEmailTemplate(PURPOSE), []);

  const rendered = useMemo(
    () => ({
      email: resolveRenderedMessage({
        templates,
        purpose: PURPOSE,
        channel: "email",
        vars,
        fallbackSubject: fallback.subject,
        fallbackBody: fallback.body,
      }),
      whatsapp: resolveRenderedMessage({
        templates,
        purpose: PURPOSE,
        channel: "whatsapp",
        vars,
        fallbackSubject: "",
        fallbackBody: fallback.body,
      }),
    }),
    [templates, vars, fallback]
  );

  useEffect(() => {
    if (!open) return;
    setChannel(initialChannel);
    setEmailTo(customer?.email?.trim() || "");
    setEmailSubject(rendered.email.subject);
    setEmailBody(rendered.email.body);
    setWhatsappBody(rendered.whatsapp.body);
  }, [open, initialChannel, customer?.email, rendered]);

  const sendEmailMutation = useMutation({
    mutationFn: async () => {
      const to = emailTo.trim();
      if (!to) throw new Error("Customer email is required");
      const subject = emailSubject.trim();
      const body = emailBody.trim();
      if (!subject) throw new Error("Subject is required");
      if (!body) throw new Error("Message is required");
      await sendEmail({
        to,
        subject,
        body,
        fromName: companySettings?.email_from_name || companySettings?.company_name,
      });
    },
    onSuccess: () => {
      toast.success("Email sent to customer");
      onOpenChange(false);
    },
    onError: (e) => toast.error(e?.message || "Failed to send email"),
  });

  const openWhatsapp = () => {
    const text = whatsappBody.trim();
    if (!text) {
      toast.error("Message cannot be empty");
      return;
    }
    const phone = customer?.phone;
    const url = buildWhatsappMeUrl(phone, text);
    if (!url) {
      toast.error(
        "Customer phone not available or invalid. Add a mobile number with country code on the customer record."
      );
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
    toast.success("WhatsApp opened — review and send the message in WhatsApp");
    onOpenChange(false);
  };

  if (!bill) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Notify customer — Bill #{bill.bill_number}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground -mt-2">
            {bill.customer_name || customer?.name || "Customer"}
            {customer?.phone ? ` · ${customer.phone}` : ""}
          </p>

          <Tabs value={channel} onValueChange={setChannel} className="mt-2">
            <TabsList className="w-full grid grid-cols-2">
              <TabsTrigger value="email" className="gap-1">
                <Mail className="w-3.5 h-3.5" /> Email
              </TabsTrigger>
              <TabsTrigger value="whatsapp" className="gap-1">
                <MessageSquare className="w-3.5 h-3.5" /> WhatsApp
              </TabsTrigger>
            </TabsList>

            <TabsContent value="email" className="space-y-3 mt-3">
              <div className="grid gap-1.5">
                <Label>To *</Label>
                <Input
                  type="email"
                  value={emailTo}
                  onChange={(e) => setEmailTo(e.target.value)}
                  placeholder="customer@example.com"
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Subject *</Label>
                <Input value={emailSubject} onChange={(e) => setEmailSubject(e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label>Message *</Label>
                <Textarea
                  value={emailBody}
                  onChange={(e) => setEmailBody(e.target.value)}
                  className="min-h-[200px] font-mono text-sm"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Uses the active &quot;Bill / Order created&quot; template from Communication Templates when set.
              </p>
            </TabsContent>

            <TabsContent value="whatsapp" className="space-y-3 mt-3">
              <div className="grid gap-1.5">
                <Label>Message *</Label>
                <Textarea
                  value={whatsappBody}
                  onChange={(e) => setWhatsappBody(e.target.value)}
                  className="min-h-[220px] font-mono text-sm"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Opens WhatsApp with this text. You can still edit it in WhatsApp before sending.
                {!customer?.phone?.trim() && (
                  <span className="block text-amber-700 mt-1">No phone on file for this customer.</span>
                )}
              </p>
            </TabsContent>
          </Tabs>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            {channel === "email" ? (
              <>
                <Button
                  variant="outline"
                  className="gap-1"
                  disabled={!emailTo.trim()}
                  onClick={() => setEmailPreview(true)}
                >
                  <Eye className="w-4 h-4" /> Preview
                </Button>
                <Button
                  className="gap-1 bg-blue-600 hover:bg-blue-700"
                  disabled={!canSend || sendEmailMutation.isPending || !emailTo.trim()}
                  onClick={() => sendEmailMutation.mutate()}
                >
                  <Mail className="w-4 h-4" /> Send email
                </Button>
              </>
            ) : (
              <Button
                className="gap-1 bg-green-600 hover:bg-green-700"
                onClick={openWhatsapp}
                disabled={!canSend || !customer?.phone?.trim()}
              >
                <MessageSquare className="w-4 h-4" /> Open WhatsApp
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <EmailPreviewDialog
        open={emailPreview}
        onClose={() => setEmailPreview(false)}
        subject={emailSubject}
        bodyText={emailBody}
        recipient={{ name: bill.customer_name || customer?.name, email: emailTo }}
      />
    </>
  );
}
