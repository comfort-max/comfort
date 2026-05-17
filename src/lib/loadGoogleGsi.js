/** Load Google Identity Services once per app session. */
export function loadGoogleGsiScript() {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Google sign-in is only available in the browser."));
  }
  if (window.google?.accounts?.id) {
    return Promise.resolve();
  }
  if (window.__comfortGoogleGsiLoad) {
    return window.__comfortGoogleGsiLoad;
  }
  window.__comfortGoogleGsiLoad = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Could not load Google sign-in."));
    document.head.appendChild(script);
  });
  return window.__comfortGoogleGsiLoad;
}
