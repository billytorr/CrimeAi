// Client-side push registration (native shells only).
//
// Loads @capacitor/push-notifications lazily so the web build never pulls it
// in and the browser bundle is unaffected. Safe to call unconditionally:
// on web, or before the plugin is installed, it returns { registered: false }
// without throwing.

import { apiUrl, authHeaders } from "@/lib/api";

export interface RegisterResult { registered: boolean; reason?: string }

function isNative(): boolean {
  if (typeof window === "undefined") return false;
  const p = window.location.protocol;
  return p === "capacitor:" || p === "ionic:";
}

export interface RegisterOptions {
  /**
   * Show the OS permission prompt if it hasn't been answered yet.
   *
   * You only get ONE shot at this prompt per install — once denied, iOS will
   * never show it again and the user has to go to Settings. So it is asked at
   * the single moment the user has just told us they want alerts (the end of
   * onboarding), and NOT on every app launch. Everywhere else passes false,
   * which silently refreshes the token of an already-granted device and
   * returns without prompting otherwise.
   */
  promptIfNeeded?: boolean;
}

export async function registerForPush(opts: RegisterOptions = {}): Promise<RegisterResult> {
  if (!isNative()) return { registered: false, reason: "not a native build" };
  try {
    // dynamic import: absent on web, and absent until the plugin is installed
    const mod: any = await import(/* webpackIgnore: true */ "@capacitor/push-notifications").catch(() => null);
    const PushNotifications = mod?.PushNotifications;
    if (!PushNotifications) return { registered: false, reason: "push plugin not installed" };

    let perm = await PushNotifications.checkPermissions();
    if (perm.receive !== "granted") {
      if (!opts.promptIfNeeded) return { registered: false, reason: `permission ${perm.receive}` };
      perm = await PushNotifications.requestPermissions();
    }
    if (perm.receive !== "granted") return { registered: false, reason: "permission denied" };

    return await new Promise<RegisterResult>((resolve) => {
      const done = (r: RegisterResult) => resolve(r);
      PushNotifications.addListener("registration", async (t: { value: string }) => {
        try {
          const platform = /android/i.test(navigator.userAgent) ? "android" : "ios";
          const res = await fetch(apiUrl("/api/push/register"), {
            method: "POST",
            headers: { "Content-Type": "application/json", ...(await authHeaders()) },
            body: JSON.stringify({
              token: t.value,
              platform,
              // Best guess only. A debug Xcode build gets a *sandbox* APNs
              // token and a TestFlight/App Store build gets a *production*
              // one, but JS cannot tell them apart: the Capacitor bundle is
              // always compiled with NODE_ENV=production, so checking it here
              // would report "production" for every build including debug.
              // The server corrects this on first send by retrying the other
              // APNs host and persisting whichever one works (see send.ts).
              environment: "production",
            }),
          });
          done({ registered: res.ok, reason: res.ok ? undefined : `server ${res.status}` });
        } catch (e) {
          done({ registered: false, reason: (e as Error).message });
        }
      });
      PushNotifications.addListener("registrationError", (e: unknown) =>
        done({ registered: false, reason: `registration error: ${JSON.stringify(e)}` }));
      PushNotifications.register();
      setTimeout(() => done({ registered: false, reason: "registration timed out" }), 15_000);
    });
  } catch (e) {
    return { registered: false, reason: (e as Error).message };
  }
}
