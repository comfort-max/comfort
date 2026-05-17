import React, { useState, useRef, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { db } from "@/services/SupabaseService";
import PageHeader from "@/components/shared/PageHeader";
import DataTable from "@/components/shared/DataTable";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import StatusBadge from "@/components/shared/StatusBadge";
import ConfirmModal from "@/components/shared/ConfirmModal";
import { Plus, Edit2, Trash2, Eye } from "lucide-react";
import { toast } from "sonner";
import { sortByLocaleKey } from "@/lib/utils";
import { usePermissions } from "@/hooks/usePermissions";
import {
  PURPOSE_REGISTRY,
  getBuiltinPurposeOptions,
  getCustomPurposeOptions,
  getDefaultEmailTemplate,
  getPlaceholdersForPurpose,
  getPurposeLabel,
  slugifyPurpose,
  templateByPurposeChannel,
} from "@/lib/communicationTemplate";

const CUSTOM_PURPOSE_VALUE = "__custom__";

const channelSelectOptions = sortByLocaleKey(
  [
    { value: "email", label: "Email" },
    { value: "whatsapp", label: "WhatsApp" },
  ],
  "label"
);

function insertTokenInTextarea(textarea, currentValue, token, setValue) {
  if (!textarea) return;
  const start = typeof textarea.selectionStart === "number" ? textarea.selectionStart : currentValue.length;
  const end = typeof textarea.selectionEnd === "number" ? textarea.selectionEnd : start;
  const next = currentValue.slice(0, start) + token + currentValue.slice(end);
  const caret = start + token.length;
  setValue(next);
  requestAnimationFrame(() => {
    textarea.focus();
    textarea.setSelectionRange(caret, caret);
  });
}

export default function CommunicationTemplates() {
  const queryClient = useQueryClient();
  const { can } = usePermissions();
  const canEditTemplates = can("admin_communication_templates", "edit");
  const canDeleteTemplates = can("admin_communication_templates", "delete");
  const bodyRef = useRef(null);
  const [formDialog, setFormDialog] = useState(false);
  const [confirmModal, setConfirmModal] = useState(false);
  const [previewTemplate, setPreviewTemplate] = useState(null);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [formData, setFormData] = useState({
    purpose: "",
    purpose_label: "",
    channel: "email",
    subject: "",
    body: "",
    status: "active",
  });
  const [customPurposeMode, setCustomPurposeMode] = useState(false);
  const [customPurposeLabel, setCustomPurposeLabel] = useState("");
  const [customPurposeSlug, setCustomPurposeSlug] = useState("");

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ["communication-templates"],
    queryFn: () => db.CommunicationTemplate.list(),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["communication-templates"] });

  const purposeSelectOptions = useMemo(() => {
    const builtins = getBuiltinPurposeOptions();
    const customs = getCustomPurposeOptions(templates);
    const merged = sortByLocaleKey(
      [
        ...builtins,
        ...customs.filter((c) => !builtins.some((b) => b.value === c.value)),
        { value: CUSTOM_PURPOSE_VALUE, label: "+ Add custom purpose…" },
      ],
      "label"
    );
    return merged;
  }, [templates]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      let purpose = formData.purpose;
      if (customPurposeMode || purpose === CUSTOM_PURPOSE_VALUE) {
        purpose = slugifyPurpose(customPurposeSlug || customPurposeLabel);
        if (!purpose) throw new Error("Custom purpose key is required");
      }
      const purposeLabel =
        customPurposeMode || formData.purpose === CUSTOM_PURPOSE_VALUE
          ? (customPurposeLabel || "").trim() || null
          : templates.find((t) => t.purpose === purpose)?.purpose_label || null;
      const status = formData.status;
      if (!purpose) throw new Error("Purpose is required");

      if (formData.channel === "whatsapp") {
        const fresh = await db.CommunicationTemplate.list();
        const wa = templateByPurposeChannel(fresh, purpose, "whatsapp");
        const email = templateByPurposeChannel(fresh, purpose, "email");
        if (!wa) throw new Error("WhatsApp template row missing");
        if (!email) throw new Error("Create the Email template for this purpose first (it supplies the shared message).");
        await db.CommunicationTemplate.update(wa.id, {
          ...wa,
          subject: "",
          body: email.body,
          status,
          purpose_label: email.purpose_label ?? purposeLabel,
        });
        return { mode: "whatsapp_status" };
      }

      const body = formData.body?.trim() || "";
      if (!body) throw new Error("Message body is required");
      const subject = (formData.subject || "").trim();
      const email = templateByPurposeChannel(templates, purpose, "email");
      const emailPayload = {
        purpose,
        channel: "email",
        subject,
        body,
        status,
        purpose_label: PURPOSE_REGISTRY[purpose] ? null : purposeLabel,
      };

      if (email) {
        await db.CommunicationTemplate.update(email.id, { ...email, ...emailPayload });
      } else {
        await db.CommunicationTemplate.create(emailPayload);
      }

      const all = await db.CommunicationTemplate.list();
      const wa = templateByPurposeChannel(all, purpose, "whatsapp");
      const waPayload = {
        purpose,
        channel: "whatsapp",
        subject: "",
        body,
        status,
        purpose_label: PURPOSE_REGISTRY[purpose] ? null : purposeLabel,
      };
      if (wa) {
        await db.CommunicationTemplate.update(wa.id, { ...wa, ...waPayload });
      } else {
        await db.CommunicationTemplate.create(waPayload);
      }
      return { mode: "email_and_sync" };
    },
    onSuccess: (result) => {
      invalidate();
      setFormDialog(false);
      setSelectedTemplate(null);
      if (result?.mode === "whatsapp_status") toast.success("WhatsApp template updated (message matches Email).");
      else toast.success("Saved. WhatsApp message was updated to match this email body.");
    },
    onError: (e) => toast.error(e?.message || "Could not save"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (template) => {
      const purpose = template.purpose;
      if (template.channel === "email") {
        const wa = templateByPurposeChannel(templates, purpose, "whatsapp");
        if (wa) await db.CommunicationTemplate.delete(wa.id);
      }
      await db.CommunicationTemplate.delete(template.id);
    },
    onSuccess: () => {
      invalidate();
      setConfirmModal(false);
      setSelectedTemplate(null);
      toast.success("Template deleted");
    },
    onError: (e) => toast.error(e?.message || "Delete failed"),
  });

  const handleOpenForm = (template = null) => {
    if (!canEditTemplates) return;
    if (template) {
      setSelectedTemplate(template);
      setFormData({
        purpose: template.purpose,
        purpose_label: template.purpose_label || "",
        channel: template.channel,
        subject: template.subject || "",
        body: template.body || "",
        status: template.status || "active",
      });
      setCustomPurposeMode(!PURPOSE_REGISTRY[template.purpose]);
      setCustomPurposeLabel(template.purpose_label || "");
      setCustomPurposeSlug(template.purpose);
    } else {
      setSelectedTemplate(null);
      setFormData({ purpose: "", purpose_label: "", channel: "email", subject: "", body: "", status: "active" });
      setCustomPurposeMode(false);
      setCustomPurposeLabel("");
      setCustomPurposeSlug("");
    }
    setFormDialog(true);
  };

  const handleSubmit = () => {
    if (!canEditTemplates) return;
    if (!formData.purpose && !customPurposeMode) {
      toast.error("Purpose is required");
      return;
    }
    if ((customPurposeMode || formData.purpose === CUSTOM_PURPOSE_VALUE) && !customPurposeLabel.trim()) {
      toast.error("Custom purpose name is required");
      return;
    }
    if (formData.channel === "email" && !(formData.body || "").trim()) {
      toast.error("Message body is required");
      return;
    }
    if (formData.channel === "email" && !(formData.subject || "").trim()) {
      toast.error("Email subject is required");
      return;
    }
    saveMutation.mutate();
  };

  const effectivePurpose = useMemo(
    () =>
      customPurposeMode || formData.purpose === CUSTOM_PURPOSE_VALUE
        ? slugifyPurpose(customPurposeSlug || customPurposeLabel)
        : formData.purpose,
    [customPurposeMode, formData.purpose, customPurposeSlug, customPurposeLabel]
  );

  const emailBodyForPurpose = useMemo(() => {
    if (!effectivePurpose) return "";
    return templateByPurposeChannel(templates, effectivePurpose, "email")?.body || "";
  }, [templates, effectivePurpose]);

  const placeholderTokens = getPlaceholdersForPurpose(effectivePurpose);

  const insertPlaceholder = useCallback(
    (token) => {
      if (formData.channel !== "email") return;
      insertTokenInTextarea(bodyRef.current, formData.body, token, (next) =>
        setFormData((f) => ({ ...f, body: next }))
      );
    },
    [formData.body, formData.channel]
  );

  const columns = [
    { key: "purpose", header: "Purpose", sortable: true, render: (t) => getPurposeLabel(t.purpose, templates) },
    { key: "channel", header: "Channel", sortable: true, render: (t) => t.channel.charAt(0).toUpperCase() + t.channel.slice(1) },
    { key: "subject", header: "Subject", render: (t) => t.subject || "—" },
    {
      key: "body_preview",
      header: "Message preview",
      render: (t) => (
        <button
          type="button"
          className="text-left text-xs text-primary hover:underline max-w-[220px] truncate block font-mono"
          title="Click to view full message"
          onClick={() => setPreviewTemplate(t)}
        >
          {(t.body || "").replace(/\s+/g, " ").slice(0, 96) || "—"}
          {(t.body || "").length > 96 ? "…" : ""}
        </button>
      ),
    },
    { key: "status", header: "Status", render: (t) => <StatusBadge status={t.status} /> },
    {
      key: "actions",
      header: "",
      render: (t) => (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" className="gap-1" onClick={() => setPreviewTemplate(t)}>
            <Eye className="w-3 h-3" /> View
          </Button>
          {canEditTemplates && (
            <Button size="sm" variant="outline" className="gap-1" onClick={() => handleOpenForm(t)}>
              <Edit2 className="w-3 h-3" /> Edit
            </Button>
          )}
          {canDeleteTemplates && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1 text-destructive"
              onClick={() => {
                setSelectedTemplate(t);
                setConfirmModal(true);
              }}
            >
              <Trash2 className="w-3 h-3" /> Delete
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Communication Templates"
        subtitle="Manage email & WhatsApp templates"
        permissionResource="admin_communication_templates"
      >
        {canEditTemplates && (
          <Button onClick={() => handleOpenForm()} className="gap-2">
            <Plus className="w-4 h-4" /> New Template
          </Button>
        )}
      </PageHeader>

      <div className="rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground space-y-2 max-w-3xl">
        <p>
          <strong className="text-foreground">Email is the master copy.</strong> Edit the message (and subject) on the{" "}
          <strong className="text-foreground">Email</strong> channel. When you save, the <strong className="text-foreground">WhatsApp</strong>{" "}
          template for the same purpose is updated to use the <em>same</em> message body (WhatsApp has no subject).
        </p>
        <p>
          <strong className="text-foreground">Merge fields</strong> are placeholders like <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">{"{{customer_name}}"}</code>.
          When you send a message, each token is replaced with the real value (customer name, bill number, etc.). Click a chip under the message
          box to <strong className="text-foreground">insert</strong> that token at your cursor—this avoids typos. You can also type tokens by hand
          if they match the list for this purpose exactly.
        </p>
        <p className="text-xs">
          Example: <span className="font-mono">Dear {"{{customer_name}}"}, … Amount due: {"{{amount_due}}"} …</span> becomes “Dear Jane Smith, … Amount due: ₹1,200 …” for a specific send.
        </p>
      </div>

      <DataTable columns={columns} data={templates} loading={isLoading} emptyMessage="No templates created yet" />

      <Dialog open={!!previewTemplate} onOpenChange={(o) => !o && setPreviewTemplate(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>
              {previewTemplate ? `${getPurposeLabel(previewTemplate.purpose, templates)} · ${previewTemplate.channel}` : ""}
            </DialogTitle>
          </DialogHeader>
          {previewTemplate && (
            <>
              {previewTemplate.channel === "email" && (
                <div className="text-sm">
                  <span className="text-muted-foreground">Subject: </span>
                  <span className="font-medium">{previewTemplate.subject || "—"}</span>
                </div>
              )}
              <ScrollArea className="flex-1 min-h-[200px] max-h-[55vh] rounded-md border p-3">
                <pre className="text-sm whitespace-pre-wrap font-mono leading-relaxed">{previewTemplate.body || "—"}</pre>
              </ScrollArea>
              <DialogFooter>
                <Button variant="outline" onClick={() => setPreviewTemplate(null)}>
                  Close
                </Button>
                {canEditTemplates && (
                  <Button
                    onClick={() => {
                      const t = previewTemplate;
                      setPreviewTemplate(null);
                      handleOpenForm(t);
                    }}
                  >
                    Edit this template
                  </Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={formDialog} onOpenChange={setFormDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedTemplate ? "Edit Template" : "Create Template"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Purpose *</Label>
                <Select
                  value={customPurposeMode ? CUSTOM_PURPOSE_VALUE : formData.purpose}
                  onValueChange={(v) => {
                    if (v === CUSTOM_PURPOSE_VALUE) {
                      setCustomPurposeMode(true);
                      setFormData((prev) => ({ ...prev, purpose: CUSTOM_PURPOSE_VALUE }));
                      return;
                    }
                    setCustomPurposeMode(false);
                    setCustomPurposeLabel("");
                    setCustomPurposeSlug("");
                    setFormData((prev) => {
                      if (selectedTemplate) return { ...prev, purpose: v };
                      const next = { ...prev, purpose: v };
                      if (prev.channel !== "email") return next;
                      const oldDef = prev.purpose ? getDefaultEmailTemplate(prev.purpose) : null;
                      const newDef = getDefaultEmailTemplate(v);
                      if (!newDef?.body) return next;
                      const wasEmpty = !String(prev.body || "").trim() && !String(prev.subject || "").trim();
                      const stillDefault =
                        oldDef &&
                        prev.body === oldDef.body &&
                        prev.subject === oldDef.subject;
                      if (wasEmpty || stillDefault) {
                        next.subject = newDef.subject;
                        next.body = newDef.body;
                      }
                      return next;
                    });
                  }}
                  disabled={!!selectedTemplate}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select purpose" />
                  </SelectTrigger>
                  <SelectContent>
                    {purposeSelectOptions.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {(customPurposeMode || formData.purpose === CUSTOM_PURPOSE_VALUE) && !selectedTemplate && (
                  <div className="mt-3 space-y-3 rounded-lg border p-3 bg-muted/30">
                    <div>
                      <Label>Custom purpose name *</Label>
                      <Input
                        placeholder="e.g. Delivery completed — customer"
                        value={customPurposeLabel}
                        onChange={(e) => {
                          const label = e.target.value;
                          setCustomPurposeLabel(label);
                          if (!customPurposeSlug || customPurposeSlug === slugifyPurpose(customPurposeLabel)) {
                            setCustomPurposeSlug(slugifyPurpose(label));
                          }
                        }}
                      />
                    </div>
                    <div>
                      <Label>Purpose key (slug)</Label>
                      <Input
                        className="font-mono text-sm"
                        value={customPurposeSlug}
                        onChange={(e) => setCustomPurposeSlug(slugifyPurpose(e.target.value))}
                        placeholder="delivery_completed_customer"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Used in code when wiring sends. Letters, numbers, underscores only.
                      </p>
                    </div>
                  </div>
                )}
              </div>
              <div>
                <Label>Channel *</Label>
                <Select
                  value={formData.channel}
                  onValueChange={(v) => setFormData({ ...formData, channel: v })}
                  disabled={!!selectedTemplate}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {channelSelectOptions.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {formData.channel === "email" && (
              <div>
                <Label>Email subject *</Label>
                <Input
                  placeholder="e.g., Purchase Order {{order_number}}"
                  value={formData.subject}
                  onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                />
              </div>
            )}

            {formData.channel === "email" ? (
              <>
                <div>
                  <Label>Message body * (shared with WhatsApp)</Label>
                  <Textarea
                    ref={bodyRef}
                    placeholder="Choose a purpose above to load a sample message, or type your own and use the chips below to insert merge fields."
                    value={formData.body}
                    onChange={(e) => setFormData({ ...formData, body: e.target.value })}
                    className="min-h-[220px] font-mono text-sm"
                  />
                </div>
                {placeholderTokens.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">
                      Insert merge field (click to place at cursor — same as typing the token exactly)
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {placeholderTokens.map((ph) => (
                        <Button key={ph} type="button" variant="secondary" size="sm" className="font-mono text-xs h-8" onClick={() => insertPlaceholder(ph)}>
                          {ph}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="space-y-2">
                <Label>Message body (from Email — read only)</Label>
                <Textarea readOnly value={emailBodyForPurpose || "—"} className="min-h-[220px] font-mono text-sm bg-muted/50" />
                {!templateByPurposeChannel(templates, formData.purpose, "email") && formData.purpose ? (
                  <p className="text-sm text-amber-700">Create the Email template for this purpose first; then the same text is used here.</p>
                ) : (
                  <p className="text-xs text-muted-foreground">Edit the Email row for this purpose to change wording for both channels.</p>
                )}
              </div>
            )}

            {formData.purpose && placeholderTokens.length > 0 && (
              <div className="bg-muted/50 p-3 rounded-lg text-sm space-y-1">
                <p className="font-medium">Available placeholders for this purpose</p>
                <p className="text-muted-foreground text-xs font-mono break-all">{placeholderTokens.join(", ")}</p>
              </div>
            )}

            <div>
              <Label>Status</Label>
              <Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={!canEditTemplates || saveMutation.isPending}>
              {selectedTemplate ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmModal
        open={confirmModal}
        onClose={() => setConfirmModal(false)}
        onConfirm={() => selectedTemplate && deleteMutation.mutate(selectedTemplate)}
        title="Delete template?"
        description={
          selectedTemplate?.channel === "email"
            ? `Delete "${getPurposeLabel(selectedTemplate?.purpose, templates)}" Email template? The matching WhatsApp row for this purpose will also be removed.`
            : `Delete the "${getPurposeLabel(selectedTemplate?.purpose, templates)}" WhatsApp template?`
        }
        confirmText="Delete"
        destructive
      />
    </div>
  );
}
