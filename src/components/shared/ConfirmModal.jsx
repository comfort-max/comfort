import React from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export default function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title = "Confirm",
  description = "",
  confirmText = "Confirm",
  cancelText = "Cancel",
  destructive = false,
  loading = false
}) {
  return (
    <Dialog open={!!open} onOpenChange={(v) => { if (!v) onClose?.(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        {description ? (
          <div className="text-sm text-muted-foreground whitespace-pre-line">
            {description}
          </div>
        ) : null}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={loading}>
            {cancelText}
          </Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            onClick={onConfirm}
            disabled={loading}
          >
            {confirmText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
