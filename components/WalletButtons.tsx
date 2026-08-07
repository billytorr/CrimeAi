"use client";

// Wallet buttons for checkout.
//
// Both use the official marks on a white face — Google's and Apple's brand
// guidelines both require their own logo, unmodified, on black or white. On
// this dark checkout white reads as the primary action without competing
// with the red brand button below it.
//
// ⚠️ APPLE PAY IS NOT WIRED UP. It renders DISABLED with a "Soon" chip
// rather than as a live button, because a wallet button that opens and then
// fails is worse than no button — and Google is currently reviewing this
// exact buyflow for production access. It looks right; it cannot dead-end
// anyone. Remove `disabled` and pass onClick once the Apple certificates and
// merchant-validation endpoint exist.

export function GooglePayButton({ onClick, busy }: { onClick: () => void; busy?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      aria-label="Pay with Google Pay"
      className="flex w-full items-center justify-center gap-2 rounded-xl bg-white py-3.5 text-black transition active:scale-[0.99] disabled:opacity-60"
    >
      {busy ? (
        <span className="text-sm font-semibold">Processing…</span>
      ) : (
        <>
          <GoogleG />
          <span className="text-[15px] font-medium tracking-tight">Pay</span>
        </>
      )}
    </button>
  );
}

export function ApplePayButton() {
  return (
    <button
      disabled
      aria-label="Apple Pay — coming soon"
      title="Apple Pay is coming soon"
      className="relative flex w-full cursor-not-allowed items-center justify-center gap-1.5 rounded-xl bg-white py-3.5 text-black opacity-45"
    >
      <AppleMark />
      <span className="text-[15px] font-medium tracking-tight">Pay</span>
      <span className="absolute right-3 rounded-full bg-black/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide">
        Soon
      </span>
    </button>
  );
}

/** The Google "G" in its four brand colours. */
function GoogleG() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#4285F4" d="M45.1 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h11.8c-.5 2.7-2 5-4.4 6.6v5.5h7.1c4.2-3.8 6.6-9.5 6.6-16.1z" />
      <path fill="#34A853" d="M24 46c6 0 11-2 14.6-5.4l-7.1-5.5c-2 1.3-4.5 2.1-7.5 2.1-5.8 0-10.7-3.9-12.4-9.750H4.3v5.7C7.9 40.6 15.4 46 24 46z" />
      <path fill="#FBBC05" d="M11.6 27.45c-.45-1.3-.7-2.7-.7-4.15s.25-2.85.7-4.15V13.45H4.3A21.9 21.9 0 0 0 2 23.3c0 3.55.85 6.9 2.3 9.85l7.3-5.7z" />
      <path fill="#EA4335" d="M24 9.5c3.3 0 6.2 1.1 8.5 3.3l6.3-6.3C35 2.9 30 1 24 1 15.4 1 7.9 6.4 4.3 13.45l7.3 5.7C13.3 13.4 18.2 9.5 24 9.5z" />
    </svg>
  );
}

function AppleMark() {
  return (
    <svg width="16" height="18" viewBox="0 0 17 20" fill="currentColor" aria-hidden="true">
      <path d="M14.1 10.6c0-2.2 1.8-3.3 1.9-3.3-1-1.5-2.6-1.7-3.2-1.7-1.4-.1-2.7.8-3.3.8-.7 0-1.7-.8-2.8-.8-1.5 0-2.8.8-3.6 2.1-1.5 2.6-.4 6.5 1.1 8.6.7 1 1.6 2.2 2.7 2.2 1.1 0 1.5-.7 2.8-.7s1.6.7 2.8.7c1.1 0 1.9-1 2.6-2.1.8-1.2 1.2-2.4 1.2-2.5-.1 0-2.2-.9-2.2-3.3zM11.9 3.9c.6-.7 1-1.7.9-2.7-.9 0-2 .6-2.6 1.3-.6.6-1.1 1.6-.9 2.6 1 .1 2-.5 2.6-1.2z" />
    </svg>
  );
}
