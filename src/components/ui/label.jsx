import * as React from "react"
import * as LabelPrimitive from "@radix-ui/react-label"
import { cva } from "class-variance-authority";

import { cn } from "@/lib/utils"

const labelVariants = cva(
  "text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
)

function parseLabelChildren(children, required) {
  let isRequired = Boolean(required);
  let labelChildren = children;

  if (typeof children === "string") {
    const trimmed = children.trimEnd();
    if (trimmed.endsWith("*")) {
      isRequired = true;
      labelChildren = trimmed.replace(/\s*\*\s*$/, "");
    }
  }

  return { labelChildren, isRequired };
}

const Label = React.forwardRef(({ className, children, required, ...props }, ref) => {
  const { labelChildren, isRequired } = parseLabelChildren(children, required);

  return (
    <LabelPrimitive.Root ref={ref} className={cn(labelVariants(), className)} {...props}>
      {labelChildren}
      {isRequired ? (
        <span className="text-destructive ml-0.5 font-semibold" aria-hidden="true">
          *
        </span>
      ) : null}
    </LabelPrimitive.Root>
  );
})
Label.displayName = LabelPrimitive.Root.displayName

export { Label }
