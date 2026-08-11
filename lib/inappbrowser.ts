// Open a URL in an in-app browser the user can easily exit — the Instagram-
// style reader. On native this is @capacitor/browser (SFSafariViewController on
// iOS, Chrome Custom Tabs on Android): it slides up over the app, keeps its own
// back/close chrome, and returns to CrimeAI when dismissed. On the web it falls
// back to a new tab (browsers can't embed most news sites in an iframe).
export async function openInApp(url: string): Promise<void> {
  if (!url) return;
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (Capacitor?.isNativePlatform?.()) {
      const { Browser } = await import("@capacitor/browser");
      await Browser.open({ url, presentationStyle: "popover", toolbarColor: "#0A0B10" });
      return;
    }
  } catch {
    /* plugin missing or failed — fall through to a web tab */
  }
  if (typeof window !== "undefined") window.open(url, "_blank", "noopener,noreferrer");
}
