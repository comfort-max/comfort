import React, { useMemo, useState, useEffect } from "react";
import { PERMISSION_RESOURCES } from "@/lib/permissionResources";
import { normalizePermissions, applyImpliedRules } from "@/lib/permissions";
import {
  MATRIX_CAPABILITY_ORDER,
  capabilitiesForResource,
  resourceHasCapabilityKey,
  shortLabelForCapability,
} from "@/lib/resourceCapabilities";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

function groupBy(items, keyFn) {
  const m = {};
  for (const it of items) {
    const g = keyFn(it);
    if (!m[g]) m[g] = [];
    m[g].push(it);
  }
  return m;
}

function labelForCapabilityKey(capKey) {
  for (const r of PERMISSION_RESOURCES) {
    const d = capabilitiesForResource(r.key).find((c) => c.key === capKey);
    if (d) return d.label;
  }
  return shortLabelForCapability(capKey);
}

export default function RolePermissionMatrix({ value, onChange, disabled }) {
  const [local, setLocal] = useState(() => normalizePermissions(value));

  useEffect(() => {
    setLocal(normalizePermissions(value));
  }, [value]);

  const grouped = useMemo(() => groupBy(PERMISSION_RESOURCES, (r) => r.group), []);

  const activeColumns = useMemo(
    () => MATRIX_CAPABILITY_ORDER.filter((k) => PERMISSION_RESOURCES.some((r) => resourceHasCapabilityKey(r.key, k))),
    []
  );

  const colSpan = 1 + activeColumns.length;

  const setCell = (resourceKey, action, checked) => {
    setLocal((prev) => {
      const defs = capabilitiesForResource(resourceKey);
      const merged = { ...prev[resourceKey], [action]: checked };
      if (action === "view" && !checked) {
        for (const d of defs) merged[d.key] = false;
      } else if (checked && action !== "view") {
        merged.view = true;
      }
      const next = { ...prev, [resourceKey]: applyImpliedRules(merged, defs) };
      onChange?.(next);
      return next;
    });
  };

  const selectAll = (capKey, checked) => {
    setLocal((prev) => {
      const next = { ...prev };
      for (const r of PERMISSION_RESOURCES) {
        if (!resourceHasCapabilityKey(r.key, capKey)) continue;
        const defs = capabilitiesForResource(r.key);
        const merged = { ...next[r.key], [capKey]: checked };
        if (capKey === "view" && !checked) {
          for (const d of defs) merged[d.key] = false;
        } else if (checked && capKey !== "view") {
          merged.view = true;
        }
        next[r.key] = applyImpliedRules(merged, defs);
      }
      onChange?.(next);
      return next;
    });
  };

  const clearAll = () => {
    setLocal((prev) => {
      const next = {};
      for (const r of PERMISSION_RESOURCES) {
        const defs = capabilitiesForResource(r.key);
        const row = {};
        for (const d of defs) row[d.key] = false;
        next[r.key] = applyImpliedRules(row, defs);
      }
      onChange?.(next);
      return next;
    });
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2 text-xs items-center">
        {activeColumns.map((capKey) => (
          <Button
            key={capKey}
            type="button"
            variant="outline"
            size="sm"
            className="h-7"
            disabled={disabled}
            title={`Enable ${labelForCapabilityKey(capKey)} for every module that supports it`}
            onClick={() => selectAll(capKey, true)}
          >
            All {shortLabelForCapability(capKey)}
          </Button>
        ))}
        <Button type="button" variant="ghost" size="sm" className="h-7" disabled={disabled} onClick={clearAll}>
          Clear all
        </Button>
      </div>
      <ScrollArea className="h-[min(480px,60vh)] w-full max-w-full border rounded-md">
        <div className="w-full min-w-0">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-muted/95 z-10 border-b">
              <tr>
                <th className="text-left px-3 py-2 font-medium sticky left-0 bg-muted/95 z-20 border-r shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]">
                  Module
                </th>
                {activeColumns.map((capKey) => (
                  <th
                    key={capKey}
                    className="text-center px-1 py-2 font-medium w-[52px] max-w-[52px] align-bottom leading-tight"
                    title={labelForCapabilityKey(capKey)}
                  >
                    <span className="inline-block rotate-0 hyphens-auto">{shortLabelForCapability(capKey)}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Object.entries(grouped).map(([group, rows]) => (
                <React.Fragment key={group}>
                  <tr className="bg-muted/40">
                    <td colSpan={colSpan} className="px-3 py-1.5 font-semibold text-muted-foreground sticky left-0 bg-muted/40 z-10 border-r">
                      {group}
                    </td>
                  </tr>
                  {rows.map((r) => (
                    <tr key={r.key} className="border-b last:border-0 hover:bg-muted/20">
                      <td className="px-3 py-2 align-middle sticky left-0 bg-card z-10 border-r shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06)]">
                        {r.label}
                      </td>
                      {activeColumns.map((capKey) => (
                        <td key={capKey} className="text-center py-2 align-middle px-0.5">
                          {resourceHasCapabilityKey(r.key, capKey) ? (
                            <div className="flex justify-center">
                              <Checkbox
                                disabled={disabled}
                                checked={!!local[r.key]?.[capKey]}
                                onCheckedChange={(c) => setCell(r.key, capKey, c === true)}
                                aria-label={`${r.label} — ${labelForCapabilityKey(capKey)}`}
                              />
                            </div>
                          ) : (
                            <span className="text-muted-foreground/40">—</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </ScrollArea>
      <p className="text-[11px] text-muted-foreground leading-relaxed">
        Each column is a separate permission (export includes CSV/Excel/PDF/print where the app exposes them). Turning{" "}
        <strong>View</strong> off clears every flag for that module. Enabling any other flag turns <strong>View</strong> on.
        Older roles only stored View/Edit/Delete — missing flags inherit from those until you save the role again.
      </p>
      <ul className="text-[11px] text-muted-foreground leading-relaxed list-disc pl-4 space-y-0.5">
        <li>
          <strong className="text-foreground">Upload</strong> — receipts on Bills &amp; Expenses, payment proof on Vendor Billing, logo on Company Settings.
        </li>
        <li>
          <strong className="text-foreground">Bill notify / Send PO / Remind</strong> — customer bill email &amp; WhatsApp, vendor PO email, payment &amp; delivery reminders (uses Communication Templates).
        </li>
        <li>
          <strong className="text-foreground">Communication Templates</strong> — create and edit message templates (Administration module).
        </li>
        <li>
          <strong className="text-foreground">Test email</strong> — send a test message from Email Settings.
        </li>
      </ul>
    </div>
  );
}
