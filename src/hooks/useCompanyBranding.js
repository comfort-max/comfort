import { useEffect, useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  db,
  getComfortFilesDisplayUrl,
  downloadComfortFileAsObjectUrl,
  extractComfortFilesObjectPath,
} from "@/services/SupabaseService";

/**
 * Company name + logo for sidebar, login, loading screen.
 *
 * Login runs before auth: `company_settings` must be readable by the Supabase `anon` role,
 * OR set VITE_COMPANY_NAME and VITE_COMPANY_LOGO_URL in Vercel / .env (public https image URL).
 *
 * For logos in private Storage buckets, `anon` also needs read access, e.g.:
 *   CREATE POLICY "comfort_files_anon_select"
 *   ON storage.objects FOR SELECT TO anon
 *   USING (bucket_id = 'comfort-files');
 */
export function useCompanyBranding() {
  const envName = (import.meta.env.VITE_COMPANY_NAME || "").trim();
  const envLogo = (import.meta.env.VITE_COMPANY_LOGO_URL || "").trim();

  const { data: companySettings = [] } = useQuery({
    queryKey: ["company-settings"],
    queryFn: () => db.CompanySettings.list(),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const settings = companySettings[0] || {};
  const companyName = (settings.company_name || envName || "COMFORT").trim() || "COMFORT";
  const rawLogoUrl = (settings.logo_url || envLogo || "").trim();

  const [resolvedLogoSrc, setResolvedLogoSrc] = useState("");
  const blobUrlRef = useRef(null);

  useEffect(() => {
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }

    if (!rawLogoUrl) {
      setResolvedLogoSrc("");
      return;
    }
    if (rawLogoUrl.startsWith("blob:") || rawLogoUrl.startsWith("data:")) {
      setResolvedLogoSrc(rawLogoUrl);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        let resolved = await getComfortFilesDisplayUrl(rawLogoUrl);
        const isComfortPublicUrl =
          resolved === rawLogoUrl &&
          rawLogoUrl.includes("/object/public/comfort-files/") &&
          extractComfortFilesObjectPath(rawLogoUrl);

        if (isComfortPublicUrl) {
          const blobUrl = await downloadComfortFileAsObjectUrl(rawLogoUrl);
          if (blobUrl) {
            blobUrlRef.current = blobUrl;
            resolved = blobUrl;
          }
        }
        if (!cancelled) setResolvedLogoSrc(resolved || "");
      } catch {
        if (!cancelled) setResolvedLogoSrc(rawLogoUrl);
      }
    })();

    return () => {
      cancelled = true;
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, [rawLogoUrl]);

  return { companyName, resolvedLogoSrc };
}
