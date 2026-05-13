import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import EmailPreviewDialog from "@/components/shared/EmailPreviewDialog";
import { Eye, Mail, MessageCircle } from "lucide-react";
import { normalizeWhatsappDigits } from "@/lib/whatsappLink";
import { toast } from "sonner";

/**
 * @typedef {object} ReminderRecipient
 * @property {string} id
 * @property {string} name
 * @property {string} [detail]
 */

/**
 * @param {object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {string} props.title
 * @param {ReminderRecipient[]} props.recipients
 * @param {(selected: ReminderRecipient[], channels: { sendEmail: boolean, sendWhatsApp: boolean }) => Promise<void>} props.onSend — email path uses sendEmail only
 * @param {(selected: ReminderRecipient[], opts?: { message?: string }) => Promise<void>} props.onOpenWhatsApp — optional `message` when one recipient was edited in the compose step first
 * @param {boolean} props.loading
 * @param {(recipient: ReminderRecipient) => { subject: string, body: string, recipient: { name: string, email: string }}} [props.previewEmail]
 * @param {(recipient: ReminderRecipient) => string | null | undefined} [props.getRecipientPhone]
 * @param {(recipient: ReminderRecipient) => string | null | undefined} [props.getRecipientEmail]
 * @param {(selected: ReminderRecipient[]) => string | null | undefined} [props.getWhatsAppDraft] — when exactly one recipient is selected, opens a compose dialog with this draft before WhatsApp; omit to open WhatsApp immediately
 */
export default function ReminderModal({
  open,
  onClose,
  title,
  recipients = [],
  onSend,
  onOpenWhatsApp,
  loading,
  previewEmail,
  getRecipientPhone,
  getRecipientEmail,
  getWhatsAppDraft,
}) {
  const [selectedIds, setSelectedIds] = useState([]);
  const [emailPreview, setEmailPreview] = useState(null);
  const [whatsappLoading, setWhatsappLoading] = useState(false);
  /** One-recipient WhatsApp compose before opening wa.me */
  const [whatsappCompose, setWhatsappCompose] = useState(null);

  const allSelected = recipients.length > 0 && selectedIds.length === recipients.length;

  const toggleAll = (checked) => {
    setSelectedIds(checked ? recipients.map((r) => r.id) : []);
  };

  const toggleOne = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const selectedRecipients = recipients.filter((r) => selectedIds.includes(r.id));

  const handleSendEmail = async () => {
    await onSend(selectedRecipients, { sendEmail: true, sendWhatsApp: false });
    setSelectedIds([]);
  };

  const handlePreview = () => {
    const recipient =
      recipients.find((r) => selectedIds[0] === r.id) || recipients[0];
    if (recipient && previewEmail) {
      setEmailPreview(previewEmail(recipient));
    }
  };

  const runOpenWhatsApp = async (recipients, opts) => {
    if (!onOpenWhatsApp || recipients.length === 0) return;
    setWhatsappLoading(true);
    try {
      await onOpenWhatsApp(recipients, opts);
    } finally {
      setWhatsappLoading(false);
    }
  };

  const validatePhonesAndCompose = () => {
    const missing = [];
    for (const r of selectedRecipients) {
      const raw = getRecipientPhone ? getRecipientPhone(r) : null;
      const digits = normalizeWhatsappDigits(raw);
      if (!digits || digits.length < 8) missing.push(r.name);
    }
    if (missing.length > 0) {
      toast.error(
        `No usable WhatsApp number for: ${missing.join(", ")}. Add a mobile number with country code (e.g. +91 98765 43210) in the record, then try again. You can still open WhatsApp manually and paste the message.`,
        { duration: 8000 }
      );
      return false;
    }
    return true;
  };

  const handleOpenWhatsApp = async () => {
    if (!onOpenWhatsApp || selectedRecipients.length === 0) return;
    if (!validatePhonesAndCompose()) return;

    if (getWhatsAppDraft && selectedRecipients.length === 1) {
      const draft = getWhatsAppDraft(selectedRecipients);
      if (draft != null) {
        setWhatsappCompose({ recipients: selectedRecipients, text: draft });
        return;
      }
    }

    await runOpenWhatsApp(selectedRecipients, {});
  };

  const handleConfirmWhatsappCompose = async () => {
    if (!whatsappCompose) return;
    const text = (whatsappCompose.text || "").trim();
    if (!text) {
      toast.error("Message cannot be empty");
      return;
    }
    setWhatsappCompose(null);
    await runOpenWhatsApp(whatsappCompose.recipients, { message: text });
  };

  const emailMissing = getRecipientEmail
    ? selectedRecipients.filter((r) => !String(getRecipientEmail(r) || "").trim())
    : [];

  return (
    <>
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>

          <p className="text-xs text-muted-foreground -mt-1">
            Send email and WhatsApp separately. WhatsApp opens with this text in the message field—you can change it again in WhatsApp before tapping Send. If you pick one contact, you can also edit the draft here first.
          </p>

          <div className="flex items-center gap-2 border-b pb-2 mb-2">
            <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
            <span className="text-sm text-muted-foreground">
              Select all ({recipients.length})
            </span>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2">
            {recipients.map((r) => (
              <div
                key={r.id}
                className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50"
              >
                <Checkbox
                  checked={selectedIds.includes(r.id)}
                  onCheckedChange={() => toggleOne(r.id)}
                />
                <div>
                  <div className="text-sm font-medium">{r.name}</div>
                  {r.detail && (
                    <div className="text-xs text-muted-foreground">{r.detail}</div>
                  )}
                </div>
              </div>
            ))}
          </div>

          <DialogFooter className="mt-4 flex flex-wrap gap-2 sm:justify-end">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            {previewEmail && selectedIds.length > 0 && (
              <Button variant="outline" className="gap-1" onClick={handlePreview}>
                <Eye className="w-4 h-4" /> Preview email
              </Button>
            )}
            {onOpenWhatsApp && (
              <Button
                type="button"
                variant="outline"
                className="gap-1 border-emerald-600/60 text-emerald-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                onClick={handleOpenWhatsApp}
                disabled={
                  selectedIds.length === 0 || loading || whatsappLoading
                }
              >
                <MessageCircle className="w-4 h-4" />
                Open WhatsApp ({selectedIds.length})
              </Button>
            )}
            <Button
              type="button"
              onClick={handleSendEmail}
              disabled={
                selectedIds.length === 0 ||
                loading ||
                (getRecipientEmail && emailMissing.length === selectedRecipients.length)
              }
              className="gap-1"
              title={
                getRecipientEmail && emailMissing.length > 0
                  ? `No email on file for: ${emailMissing.map((r) => r.name).join(", ")}`
                  : undefined
              }
            >
              <Mail className="w-4 h-4" />
              Send email ({selectedIds.length})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!whatsappCompose} onOpenChange={(o) => !o && setWhatsappCompose(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>WhatsApp message</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground -mt-1">
            Edit the wording below, then open WhatsApp. You can still change the text in the WhatsApp chat box before sending.
          </p>
          {whatsappCompose && (
            <>
              <div className="space-y-2 flex-1 min-h-0 flex flex-col">
                <Label className="text-xs">To: {whatsappCompose.recipients[0]?.name}</Label>
                <Textarea
                  className="min-h-[200px] flex-1 font-mono text-sm"
                  value={whatsappCompose.text}
                  onChange={(e) =>
                    setWhatsappCompose((prev) =>
                      prev ? { ...prev, text: e.target.value } : prev
                    )
                  }
                />
              </div>
              <DialogFooter className="gap-2 sm:justify-end">
                <Button variant="outline" onClick={() => setWhatsappCompose(null)}>
                  Back
                </Button>
                <Button onClick={handleConfirmWhatsappCompose} disabled={whatsappLoading}>
                  Open WhatsApp
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <EmailPreviewDialog
        open={!!emailPreview}
        onClose={() => setEmailPreview(null)}
        subject={emailPreview?.subject}
        bodyText={emailPreview?.body}
        recipient={emailPreview?.recipient}
      />
    </>
  );
}
