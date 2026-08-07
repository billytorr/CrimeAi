// App-lock preference.
//
// Stored per-DEVICE in localStorage, deliberately NOT on the profile: "lock
// this phone" is a statement about this handset, not about the account. A
// user with a locked phone and an unlocked tablet is a coherent thing to
// want, and syncing it would mean an attacker who reached the account could
// also switch the lock off everywhere.

const KEY = "pscc_app_lock";

export function appLockEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try { return window.localStorage.getItem(KEY) === "1"; } catch { return false; }
}

export function setAppLockEnabled(on: boolean): void {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(KEY, on ? "1" : "0"); } catch { /* private mode */ }
}
