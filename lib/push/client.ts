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

export async function registerForPush(): Promise<RegisterResult> {
  if (!isNative()) return { registered: false, reason: "not a native build" };
  try {
    // dynamic import: absent on web, and absent until the plugin is installed
    const mod: any = await import(/* webpackIgnore: true */ "@capacitor/push-notifications").catch(() => null);
    const PushNotifications = mod?.PushNotifications;
    if (!PushNotifications) return { registered: false, reason: "push plugin not installed" };

    const perm = await PushNotifications.requestPermissions();
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
              // debug builds talk to APNs sandbox; release builds to production
              environment: process.env.NODE_ENV === "production" ? "production" : "sandbox",
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
