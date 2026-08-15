"use client";

import { useEffect, useState } from "react";
import { getCurrentAccount, type Account, type Profile } from "@/lib/auth";
import AuthScreen from "@/components/auth/AuthScreen";
import Onboarding from "@/components/auth/Onboarding";
import AppShell from "@/components/AppShell";
import AppLock from "@/components/AppLock";
import { appLockEnabled } from "@/lib/biometric/lock";
import Logo from "@/components/Logo";

type Stage = "loading" | "auth" | "onboarding" | "app";

// The splash video shows only while the app is actually loading (auth +
// profile check), never the full 8s clip — with a short minimum so it
// reads as an intro rather than a flash, then fades into the app.
const SPLASH_MIN_MS = 1600;
const SPLASH_FADE_MS = 500;

export default function Page() {
  const [stage, setStage] = useState<Stage>("loading");
  const [account, setAccount] = useState<Account | null>(null);
  const [minElapsed, setMinElapsed] = useState(false);
  const [splashGone, setSplashGone] = useState(false);
  // Locked until proven otherwise, but only for users who opted in — read
  // once on mount so a re-render can't silently re-lock a live session.
  const [locked, setLocked] = useState(false);

  useEffect(() => { setLocked(appLockEnabled()); }, []);

  async function refresh() {
    const u = await getCurrentAccount();
    if (!u) { setAccount(null); setStage("auth"); }
    else if (!u.profile) { setAccount(u); setStage("onboarding"); }
    else { setAccount(u); setStage("app"); }
  }

  useEffect(() => {
    refresh();
    const t = setTimeout(() => setMinElapsed(true), SPLASH_MIN_MS);
    return () => clearTimeout(t);
  }, []);

  // Native deep links (crimeai://): the in-app-browser OAuth return installs a
  // session and fires "crimeai:authed" — re-read the account so the shell
  // advances past the auth screen without a reload. No-op on web.
  useEffect(() => {
    let onAuthed: (() => void) | null = null;
    import("@/lib/native/deepLinks").then((m) => {
      m.initDeepLinks();
      onAuthed = () => refresh();
      window.addEventListener(m.AUTHED_EVENT, onAuthed);
    }).catch(() => {});
    return () => {
      if (onAuthed) import("@/lib/native/deepLinks").then((m) => window.removeEventListener(m.AUTHED_EVENT, onAuthed!)).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // loading finished + minimum shown → fade the splash out, then unmount
  const splashFading = stage !== "loading" && minElapsed;
  useEffect(() => {
    if (!splashFading) return;
    const t = setTimeout(() => setSplashGone(true), SPLASH_FADE_MS);
    return () => clearTimeout(t);
  }, [splashFading]);

  return (
    <div className="app-stage">
      <div className="app-shell">
        {stage === "auth" && <AuthScreen onAuthed={refresh} />}
        {stage === "onboarding" && account && (
          <Onboarding
            name={account.name}
            email={account.email}
            userId={account.id}
            existing={account.profile}
            draftHandle={account.draftHandle}
            draftPhoto={account.draftPhoto}
            onDone={(p: Profile) => {
              setAccount({ ...account, profile: p });
              setStage("app");
            }}
          />
        )}
        {stage === "app" && account && (
          <AppShell
            account={account}
            onLogout={refresh}
            onChangeAddress={(current: Profile) => {
              // rerun onboarding for the address step — the CURRENT profile
              // (handle, photo, contacts, alerts) is preserved and prefilled
              setAccount({ ...account, profile: current });
              setStage("onboarding");
            }}
          />
        )}

        {/* Renders OVER the app, never instead of it, so unlocking reveals
            the screen already loaded underneath. Only for signed-in users who
            turned the lock on — see components/AppLock.tsx for why SOS stays
            reachable from it. */}
        {locked && stage === "app" && account?.profile && (
          <AppLock profile={account.profile} onUnlock={() => setLocked(false)} />
        )}

        {!splashGone && <VideoSplash fading={splashFading} />}
      </div>
    </div>
  );
}

// Brand intro video, full-bleed over the shell. Muted + playsInline so it
// autoplays on iOS/Android; the logo sits behind it as a fallback while
// the first frames decode (or if video ever fails).
function VideoSplash({ fading }: { fading: boolean }) {
  return (
    <div
      className="absolute inset-0 z-[2000] grid place-items-center bg-shell transition-opacity ease-out"
      style={{ opacity: fading ? 0 : 1, transitionDuration: `${SPLASH_FADE_MS}ms`, pointerEvents: fading ? "none" : "auto" }}
    >
      <div className="flex flex-col items-center gap-3">
        <Logo size={72} />
        <div className="text-sm text-ink2">CrimeAI</div>
      </div>
      <video
        src="/splash.mp4"
        autoPlay
        muted
        playsInline
        preload="auto"
        className="absolute inset-0 h-full w-full object-cover"
      />
    </div>
  );
}
