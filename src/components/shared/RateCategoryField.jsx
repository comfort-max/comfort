import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * Company/vendor rate category: scrollable list of known categories plus a text field for any new name.
 * Native HTML datalist is unreliable inside dialogs in some browsers.
 */
export function RateCategoryField({ id, label = "Category *", value, onChange, options, disabled }) {
  const list = Array.isArray(options) ? options : [];
  const selectValue = list.includes(value) ? value : "";

  return (
    <div className="space-y-2">
      <Label htmlFor={id ? `${id}-text` : undefined}>{label}</Label>
      <select
        id={id ? `${id}-select` : undefined}
        aria-label="Pick an existing category"
        className={cn(
          "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm",
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        )}
        disabled={disabled}
        value={selectValue}
        onChange={(e) => {
          const v = e.target.value;
          if (v) onChange(v);
        }}
      >
        <option value="">Pick existing category…</option>
        {list.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      <p className="text-xs text-muted-foreground">Or type a new category below.</p>
      <Input
        id={id ? `${id}-text` : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Category name"
        disabled={disabled}
        autoComplete="off"
      />
    </div>
  );
}
