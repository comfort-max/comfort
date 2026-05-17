import { useEffect } from "react";
import { useCompanyBranding } from "@/hooks/useCompanyBranding";
import { applyDynamicAppIcons } from "@/lib/appIcons";

/** Syncs document favicon and apple-touch-icon with Company Settings logo. */
export default function DynamicAppIcons() {
  const { companyName, resolvedLogoSrc } = useCompanyBranding();

  useEffect(() => {
    applyDynamicAppIcons({
      logoSrc: resolvedLogoSrc,
      companyName,
      cacheBust: true,
    });
  }, [resolvedLogoSrc, companyName]);

  return null;
}
