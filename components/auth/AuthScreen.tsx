"use client";

import { useState } from "react";
import { login, startSignup, verifySignup, resendSignupCode, requestPasswordReset, completePasswordReset, ssoLogin } from "@/lib/auth";
import Logo from "@/components/Logo";
import LegalGate from "@/components/LegalGate";
import { flushAcceptance } from "@/lib/legal";
import { getCurrentAccount } from "@/lib/auth";

type Mode = "signup" | "login" | "verify" | "forgot" | "reset";

export default function AuthScreen({ onAuthed }: { onAuthed: () => void }) {
  const [mode, setMode] = useState<Mode>("signup");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  // Local demo mode has no email service — the code is surfaced on-screen
  // so the whole flow stays demo-able. Absent once Supabase SMTP is live.
  const [demoCode, setDemoCode] = useState("");
  // click-through agreement (TikTok-style): shown as its own step right
  // AFTER tapping Create account; agreeing continues the signup automatically
  const [agreed, setAgreed] = useState(false);
  const [legalOpen, setLegalOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<null | "signup" | "google" | "apple">(null);

  function switchMode(m: Mode) {
    setMode(m); setError(""); setNotice(""); setCode(""); setDemoCode("");
  }

  async function run(fn: () => Promise<void>) {
    setBusy(true); setError("");
    try { await fn(); } catch (e) { setError((e as Error).message); }
    setBusy(false);
  }

  // once a session exists, write the acceptance records (user+version+time)
  async function recordAcceptance() {
    try {
      const acct = await getCurrentAccount();
      if (acct) await flushAcceptance(acct.id);
    } catch {}
  }

  const submitSignup = () => run(async () => {
    if (!agreed) { setPendingAction("signup"); setLegalOpen(true); return; }
    const r = await startSignup(name, email, password);
    if (r.alreadyVerified) { await recordAcceptance(); onAuthed(); return; } // backend auto-confirmed
    setDemoCode(r.demoCode || "");
    setNotice(`We sent a 6-digit code to ${email.trim().toLowerCase()}.`);
    setMode("verify"); setCode("");
  });

  const submitSignupAgreed = () => run(async () => {
    const r = await startSignup(name, email, password);
    if (r.alreadyVerified) { await recordAcceptance(); onAuthed(); return; }
    setDemoCode(r.demoCode || "");
    setNotice(`We sent a 6-digit code to ${email.trim().toLowerCase()}.`);
    setMode("verify"); setCode("");
  });

  const ssoAgreed = (provider: "google" | "apple") => run(async () => {
    const acct = await ssoLogin(provider);
    if (acct) { await flushAcceptance(acct.id).catch(() => {}); onAuthed(); }
  });

  const submitVerify = () => run(async () => {
    await verifySignup(email, code);
    await recordAcceptance();
    onAuthed();
  });

  const resend = () => run(async () => {
    const r = await resendSignupCode(email);
    setDemoCode(r.demoCode || "");
    setNotice("New code sent.");
  });

  const submitLogin = () => run(async () => {
    await login(email, password);
    onAuthed();
  });

  const submitForgot = () => run(async () => {
    const r = await requestPasswordReset(email);
    setDemoCode(r.demoCode || "");
    setNotice(`We sent a recovery code to ${email.trim().toLowerCase()}.`);
    setMode("reset"); setCode("");
  });

  const submitReset = () => run(async () => {
    await completePasswordReset(email, code, newPassword);
    onAuthed();
  });

  const sso = (provider: "google" | "apple") => run(async () => {
    if (mode === "signup" && !agreed) { setPendingAction(provider); setLegalOpen(true); return; }
    const acct = await ssoLogin(provider);
    if (acct) { await flushAcceptance(acct.id).catch(() => {}); onAuthed(); } // with real OAuth the browser redirects instead
  });

  const sub: Record<Mode, string> = {
    signup: "Public Safety Crime Center",
    login: "Public Safety Crime Center",
    verify: "Verify your email",
    forgot: "Reset your password",
    reset: "Reset your password",
  };

  return (
    <div className="scroll-area safe-top flex flex-col px-6 pt-14">
      <div className="flex flex-col items-center text-center">
        <Logo size={56} />
        <h1 className="mt-5 text-2xl font-bold tracking-tight">CrimeAI</h1>
        <p className="mt-1 text-sm text-ink2">{sub[mode]}</p>
      </div>

      {(mode === "signup" || mode === "login") && (
        <div className="mt-8 flex rounded-xl border border-ink/10 bg-ink/5 p-1 text-sm">
          <button onClick={() => switchMode("signup")} className={`flex-1 rounded-lg py-2 font-medium transition ${mode === "signup" ? "bg-brand text-white" : "text-ink2"}`}>
            Create account
          </button>
          <button onClick={() => switchMode("login")} className={`flex-1 rounded-lg py-2 font-medium transition ${mode === "login" ? "bg-brand text-white" : "text-ink2"}`}>
            Log in
          </button>
        </div>
      )}

      <div className="mt-5 space-y-3">
        {mode === "signup" && (
          <>
            <Field label="Name" value={name} onChange={setName} placeholder="Maria" />
            <Field label="Email" value={email} onChange={setEmail} placeholder="you@email.com" type="email" />
            <Field label="Password" value={password} onChange={setPassword} placeholder="8+ characters" type="password" onEnter={submitSignup} />
            {error && <p className="text-sm text-red-400">{error}</p>}
            <PrimaryButton busy={busy} onClick={submitSignup}>Create account →</PrimaryButton>
            <p className="text-center text-[11px] leading-relaxed text-ink3">
              Next you&apos;ll review and agree to the <span className="font-medium text-ink2">Terms of Service</span> and <span className="font-medium text-ink2">Privacy Policy</span>.
            </p>
            <SsoButtons busy={busy} onPick={sso} />
          </>
        )}

        {mode === "login" && (
          <>
            <Field label="Email" value={email} onChange={setEmail} placeholder="you@email.com" type="email" />
            <Field label="Password" value={password} onChange={setPassword} placeholder="••••••••" type="password" onEnter={submitLogin} />
            {error && <p className="text-sm text-red-400">{error}</p>}
            <PrimaryButton busy={busy} onClick={submitLogin}>Log in →</PrimaryButton>
            <button onClick={() => switchMode("forgot")} className="w-full py-1 text-center text-sm font-medium text-brand">
              Forgot password?
            </button>
            <SsoButtons busy={busy} onPick={sso} />
          </>
        )}

        {mode === "verify" && (
          <>
            {notice && <p className="text-center text-sm text-ink2">{notice}</p>}
            {demoCode && <DemoCodeHint code={demoCode} />}
            <CodeField value={code} onChange={setCode} onEnter={submitVerify} />
            {error && <p className="text-sm text-red-400">{error}</p>}
            <PrimaryButton busy={busy} onClick={submitVerify}>Verify →</PrimaryButton>
            <div className="flex items-center justify-between px-1 text-sm">
              <button onClick={() => switchMode("signup")} className="text-ink2">← Back</button>
              <button onClick={resend} className="font-medium text-brand">Resend code</button>
            </div>
          </>
        )}

        {mode === "forgot" && (
          <>
            <p className="text-center text-sm text-ink2">Enter your account email and we&apos;ll send a 6-digit recovery code.</p>
            <Field label="Email" value={email} onChange={setEmail} placeholder="you@email.com" type="email" onEnter={submitForgot} />
            {error && <p className="text-sm text-red-400">{error}</p>}
            <PrimaryButton busy={busy} onClick={submitForgot}>Send recovery code →</PrimaryButton>
            <button onClick={() => switchMode("login")} className="w-full py-1 text-center text-sm text-ink2">← Back to log in</button>
          </>
        )}

        {mode === "reset" && (
          <>
            {notice && <p className="text-center text-sm text-ink2">{notice}</p>}
            {demoCode && <DemoCodeHint code={demoCode} />}
            <CodeField value={code} onChange={setCode} />
            <Field label="New password" value={newPassword} onChange={setNewPassword} placeholder="8+ characters" type="password" onEnter={submitReset} />
            {error && <p className="text-sm text-red-400">{error}</p>}
            <PrimaryButton busy={busy} onClick={submitReset}>Set new password →</PrimaryButton>
            <div className="flex items-center justify-between px-1 text-sm">
              <button onClick={() => switchMode("login")} className="text-ink2">← Back</button>
              <button onClick={submitForgot} className="font-medium text-brand">Resend code</button>
            </div>
          </>
        )}
      </div>

      <p className="mt-5 text-center text-xs text-ink3">
        By continuing you agree this is informational only. In an emergency, call 911.
      </p>
      <p className="mt-auto py-6 text-center text-[11px] text-ink3">
        BlackSeed Labs / TORR AI · Miami beta
      </p>

      {legalOpen && (
        <LegalGate
          onAgreed={() => {
            setAgreed(true); setLegalOpen(false); setError("");
            // continue exactly what the user was doing
            if (pendingAction === "signup") setTimeout(() => submitSignupAgreed(), 0);
            else if (pendingAction) setTimeout(() => ssoAgreed(pendingAction), 0);
            setPendingAction(null);
          }}
          onClose={() => { setLegalOpen(false); setPendingAction(null); }}
        />
      )}
    </div>
  );
}

function SsoButtons({ busy, onPick }: { busy: boolean; onPick: (p: "google" | "apple") => void }) {
  return (
    <div className="pt-1">
      <div className="flex items-center gap-3 py-2">
        <span className="h-px flex-1 bg-ink/10" />
        <span className="text-xs text-ink3">or continue with</span>
        <span className="h-px flex-1 bg-ink/10" />
      </div>
      <div className="flex gap-3">
        <button onClick={() => onPick("google")} disabled={busy} className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-ink/10 bg-shell py-3 text-sm font-semibold text-ink transition active:scale-[0.99] disabled:opacity-60">
          <GoogleG /> Google
        </button>
        <button onClick={() => onPick("apple")} disabled={busy} className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-ink/10 bg-shell py-3 text-sm font-semibold text-ink transition active:scale-[0.99] disabled:opacity-60">
          <AppleMark /> Apple
        </button>
      </div>
    </div>
  );
}

function GoogleG() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M23.5 12.27c0-.85-.08-1.66-.22-2.45H12v4.64h6.45a5.52 5.52 0 0 1-2.39 3.62v3h3.87c2.26-2.09 3.57-5.16 3.57-8.81z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.93-2.91l-3.87-3c-1.07.72-2.45 1.15-4.06 1.15-3.12 0-5.77-2.11-6.71-4.95H1.29v3.09A11.99 11.99 0 0 0 12 24z" />
      <path fill="#FBBC05" d="M5.29 14.29A7.2 7.2 0 0 1 4.91 12c0-.8.14-1.57.38-2.29V6.62H1.29a12 12 0 0 0 0 10.76l4-3.09z" />
      <path fill="#EA4335" d="M12 4.77c1.76 0 3.34.6 4.58 1.79l3.44-3.44C17.95 1.19 15.24 0 12 0A11.99 11.99 0 0 0 1.29 6.62l4 3.09C6.23 6.88 8.88 4.77 12 4.77z" />
    </svg>
  );
}

function AppleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M16.36 12.79c-.03-2.53 2.07-3.74 2.16-3.8-1.18-1.72-3.01-1.96-3.66-1.99-1.56-.16-3.04.92-3.83.92-.79 0-2.01-.9-3.3-.87-1.7.02-3.27.99-4.14 2.5-1.77 3.07-.45 7.61 1.27 10.1.84 1.22 1.84 2.59 3.16 2.54 1.27-.05 1.75-.82 3.28-.82 1.53 0 1.96.82 3.3.79 1.36-.02 2.22-1.24 3.05-2.46.96-1.41 1.36-2.78 1.38-2.85-.03-.01-2.64-1.01-2.67-4.02zM13.84 5.35c.7-.85 1.17-2.02 1.04-3.2-1.01.04-2.23.67-2.95 1.52-.65.75-1.22 1.95-1.06 3.1 1.12.09 2.27-.57 2.97-1.42z" />
    </svg>
  );
}

function PrimaryButton({ busy, onClick, children }: { busy: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} disabled={busy} className="mt-1 w-full rounded-xl bg-brand py-3.5 text-sm font-semibold text-white transition active:scale-[0.99] disabled:opacity-60">
      {busy ? "Please wait…" : children}
    </button>
  );
}

function CodeField({ value, onChange, onEnter }: { value: string; onChange: (v: string) => void; onEnter?: () => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-center text-xs font-medium uppercase tracking-wide text-ink2">6-digit code</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
        onKeyDown={(e) => e.key === "Enter" && onEnter?.()}
        inputMode="numeric"
        autoComplete="one-time-code"
        placeholder="••••••"
        className="w-full rounded-xl border border-ink/10 bg-shell px-4 py-3 text-center text-2xl font-bold tracking-[0.5em] outline-none placeholder:text-ink3 focus:border-brand/60"
      />
    </label>
  );
}

function DemoCodeHint({ code }: { code: string }) {
  return (
    <p className="rounded-xl border border-blu/30 bg-blu/10 px-3 py-2 text-center text-xs text-blu">
      Demo mode (no email service connected) — your code is <span className="font-bold tracking-widest">{code}</span>
    </p>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  onEnter,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  onEnter?: () => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-ink2">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && onEnter?.()}
        placeholder={placeholder}
        autoCapitalize={type === "email" || type === "password" ? "none" : "words"}
        autoCorrect="off"
        className="w-full rounded-xl border border-ink/10 bg-shell px-4 py-3 text-base outline-none placeholder:text-ink3 focus:border-brand/60"
      />
    </label>
  );
}
