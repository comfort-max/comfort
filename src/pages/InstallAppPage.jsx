import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Download, Monitor, Smartphone, Copy, Check, ExternalLink, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { getAppOrigin } from "@/lib/appOrigin";
import { usePwaInstall } from "@/hooks/usePwaInstall";
import { useCompanyBranding } from "@/hooks/useCompanyBranding";
import { CompanyLogoMark } from "@/components/shared/CompanyLogoMark";

const APP_URL = getAppOrigin();

function CopyUrlButton() {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(APP_URL);
      setCopied(true);
      toast.success("Link copied");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy link");
    }
  };
  return (
    <Button type="button" variant="outline" size="sm" className="gap-1 shrink-0" onClick={copy}>
      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
      {copied ? "Copied" : "Copy link"}
    </Button>
  );
}

export default function InstallAppPage() {
  const { canInstall, isInstalled, isIos, promptInstall } = usePwaInstall();
  const { companyName, resolvedLogoSrc } = useCompanyBranding();
  const [installing, setInstalling] = useState(false);

  const handleInstall = async () => {
    setInstalling(true);
    try {
      const { outcome } = await promptInstall();
      if (outcome === "accepted") toast.success("COMFORT installed — open it from your apps");
      else if (outcome === "dismissed") toast.message("Install cancelled");
      else toast.message("Use the steps below for your device");
    } finally {
      setInstalling(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 px-4 py-10">
      <div className="max-w-lg mx-auto space-y-6">
        <div className="flex items-center justify-between gap-2">
          <Link to="/login" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
            <ArrowLeft className="w-3.5 h-3.5" /> Back to login
          </Link>
          <a
            href={APP_URL}
            className="text-sm text-primary hover:underline inline-flex items-center gap-1"
            target="_blank"
            rel="noreferrer"
          >
            Open app <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>

        <div className="text-center space-y-2">
          <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center mx-auto shadow-md overflow-hidden ring-1 ring-primary/20">
            <CompanyLogoMark
              src={resolvedLogoSrc}
              companyName={companyName}
              imgClassName="w-full h-full object-contain bg-primary p-1"
              letterClassName="text-primary-foreground font-bold text-3xl"
            />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Install {companyName}</h1>
          <p className="text-sm text-muted-foreground">
            Step-by-step guide to add the app on your computer (Chrome / Edge) or phone (Android / iPhone). Works like a
            native app — no app store required.
          </p>
        </div>

        <Card className="border-primary/20 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">App address</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-2">
            <code className="text-xs bg-muted px-2 py-1.5 rounded flex-1 min-w-0 break-all">{APP_URL}</code>
            <CopyUrlButton />
          </CardContent>
        </Card>

        {isInstalled ? (
          <Card className="border-emerald-200 bg-emerald-50/80 dark:bg-emerald-950/30">
            <CardContent className="pt-6 text-center text-sm text-emerald-800 dark:text-emerald-200">
              COMFORT is already installed on this device. Open it from your home screen or app launcher.
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="pt-6 space-y-3">
              {canInstall && !isIos && (
                <Button className="w-full gap-2 h-11" size="lg" onClick={handleInstall} disabled={installing}>
                  <Download className="w-5 h-5" />
                  {installing ? "Installing…" : "Install COMFORT (Chrome / Edge)"}
                </Button>
              )}
              {(!canInstall || isIos) && (
                <p className="text-xs text-center text-muted-foreground">
                  {isIos
                    ? "On iPhone, use Safari and Add to Home Screen (see iPhone tab below)."
                    : "If no button appears, open this page in Chrome and use the steps below, or use the install icon in the address bar (⊕)."}
                </p>
              )}
            </CardContent>
          </Card>
        )}

        <Tabs defaultValue={isIos ? "iphone" : "chrome"} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="chrome" className="gap-1 text-xs sm:text-sm">
              <Monitor className="w-3.5 h-3.5 hidden sm:inline" /> Chrome
            </TabsTrigger>
            <TabsTrigger value="android" className="gap-1 text-xs sm:text-sm">
              <Smartphone className="w-3.5 h-3.5 hidden sm:inline" /> Android
            </TabsTrigger>
            <TabsTrigger value="iphone" className="gap-1 text-xs sm:text-sm">
              <Smartphone className="w-3.5 h-3.5 hidden sm:inline" /> iPhone
            </TabsTrigger>
          </TabsList>

          <TabsContent value="chrome" className="mt-4">
            <Card>
              <CardContent className="pt-6 text-sm space-y-3 text-muted-foreground">
                <ol className="list-decimal list-inside space-y-2">
                  <li>
                    Open{" "}
                    <a href={APP_URL} className="text-primary font-medium hover:underline">
                      {APP_URL}
                    </a>{" "}
                    in <strong className="text-foreground">Google Chrome</strong> or Microsoft Edge.
                  </li>
                  <li>Sign in to your account.</li>
                  <li>
                    Click <strong className="text-foreground">Install</strong> on this page, or the install icon (⊕) in the address bar →{" "}
                    <strong className="text-foreground">Install COMFORT Laundry</strong>.
                  </li>
                  <li>Launch COMFORT from your desktop Start menu or taskbar.</li>
                </ol>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="android" className="mt-4">
            <Card>
              <CardContent className="pt-6 text-sm space-y-3 text-muted-foreground">
                <ol className="list-decimal list-inside space-y-2">
                  <li>
                    Open the link in <strong className="text-foreground">Chrome</strong> on your Android phone.
                  </li>
                  <li>Sign in.</li>
                  <li>
                    Tap the menu (⋮) → <strong className="text-foreground">Install app</strong> or{" "}
                    <strong className="text-foreground">Add to Home screen</strong>.
                  </li>
                  <li>Confirm — the COMFORT icon appears on your home screen.</li>
                </ol>
                <p className="text-xs pt-1">
                  Some phones show a banner: “Add COMFORT to Home screen” — tap <strong className="text-foreground">Install</strong>.
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="iphone" className="mt-4">
            <Card>
              <CardContent className="pt-6 text-sm space-y-3 text-muted-foreground">
                <p className="text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/40 border border-amber-200/60 rounded-md px-3 py-2 text-xs">
                  Use <strong>Safari</strong> — Chrome on iPhone cannot add home-screen apps with full-screen mode.
                </p>
                <ol className="list-decimal list-inside space-y-2">
                  <li>
                    Open{" "}
                    <a href={APP_URL} className="text-primary font-medium hover:underline">
                      {APP_URL}
                    </a>{" "}
                    in Safari.
                  </li>
                  <li>Sign in.</li>
                  <li>
                    Tap <strong className="text-foreground">Share</strong> (square with arrow) →{" "}
                    <strong className="text-foreground">Add to Home Screen</strong>.
                  </li>
                  <li>Tap <strong className="text-foreground">Add</strong> — open COMFORT from your home screen.</li>
                </ol>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
