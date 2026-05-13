import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";

export default function ProgressModal({ open, title = "Processing...", current = 0, total = 0 }) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="max-w-sm" onInteractOutside={e => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-primary" />
            {title}
          </DialogTitle>
        </DialogHeader>

        <div className="py-4 space-y-3">
          {total > 1 ? (
            <>
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>{current} of {total}</span>
                <span>{pct}%</span>
              </div>
              <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                <div
                  className="h-2 bg-primary rounded-full transition-all duration-300 ease-out"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </>
          ) : (
            <div className="flex justify-center py-2">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
