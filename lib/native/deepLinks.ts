// crimeai:// deep-link handling for the native shells.
//
// Two links today:
//   crimeai://auth-callback#access_token=…&refresh_token=…
//     Return leg of the in-app-browser OAuth flow (Google via
//     SFSafariViewController / Custom Tabs). We install the session the
//     fragment carries, close the browser sheet, and announce "authed" so the
//     app shell re-reads the account without a reload.
//   crimeai://checkout-return
//     Return leg of the external Authorize.Net checkout (Phase 4 consumes the
//     event to refresh entitlement).
//
// Safe to call on web — it no-ops off native.

import { supabase } from "@/lib/supabase";

export const AUTHED_EVENT = "crimeai:authed";
export const CHECKOUT_RETURN_EVENT = "crimeai:checkout-return";

let installed = false;

export async function initDeepLinks(): Promise<void> {
  if (installed) return;
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (!Capacitor.isNativePlatform()) return;
    const { App } = await import("@capacitor/app");
    installed = true;
    App.addListener("appUrlOpen", async ({ url }) => {
      if (!url || !url.startsWith("crimeai://")) return;
      // Dismiss the in-app browser sheet that initiated the round trip.
      try { const { Browser } = await import("@capacitor/browser"); await Browser.close(); } catch {}

      if (url.startsWith("crimeai://auth-callback")) {
        // Supabase's implicit flow returns tokens in the fragment.
        const raw = url.split("#")[1] ?? url.split("?")[1] ?? "";
        const p = new URLSearchParams(raw);
        const access_token = p.get("access_token");
        const refresh_token = p.get("refresh_token");
        if (access_token && refresh_token && supabase) {
          const { error } = await supabase.auth.setSession({ access_token, refresh_token });
          if (!error) window.dispatchEvent(new Event(AUTHED_EVENT));
        }
        return;
      }
      if (url.startsWith("crimeai://checkout-return")) {
        window.dispatchEvent(new Event(CHECKOUT_RETURN_EVENT));
      }
    });
  } catch {
    /* plugin unavailable (web build) — nothing to do */
  }
}
