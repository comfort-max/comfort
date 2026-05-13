import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

/**
 * Renders a simple HTML email preview.
 * Props:
 *   open        - boolean
 *   onClose     - fn
 *   subject     - string
 *   bodyText    - plain text body (will be rendered as HTML)
 *   recipient   - { name, email }
 */
export default function EmailPreviewDialog({ open, onClose, subject, bodyText, recipient }) {
  const htmlBody = bodyText
    ? bodyText
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .split("\n")
        .map(line => line.trim() === "" ? "<br/>" : `<p style="margin:0 0 4px 0">${line}</p>`)
        .join("")
    : "";

  const html = `
    <html>
    <body style="font-family: Arial, sans-serif; font-size: 14px; color: #333; padding: 24px; max-width: 600px; margin: 0 auto;">
      <div style="border-bottom: 2px solid #eee; padding-bottom: 12px; margin-bottom: 16px;">
        <div style="font-size: 12px; color: #888; margin-bottom: 4px;">To: <strong>${recipient?.name || ""}${recipient?.email ? ` &lt;${recipient.email}&gt;` : ""}</strong></div>
        <div style="font-size: 12px; color: #888;">Subject: <strong>${subject || ""}</strong></div>
      </div>
      <div style="line-height: 1.7;">${htmlBody}</div>
    </body>
    </html>
  `;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Email Preview
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-auto border rounded-lg bg-white min-h-[300px]">
          <iframe
            srcDoc={html}
            title="Email Preview"
            className="w-full h-full min-h-[400px] rounded-lg"
            sandbox="allow-same-origin"
          />
        </div>
        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose} className="gap-2">
            <ArrowLeft className="w-4 h-4" /> Back
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}