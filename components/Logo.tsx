// App brand mark — the CrimeAI owl-shield (red). Used in headers, splash,
// auth, and chat. Renders the shared /icon.svg clipped to a rounded tile so
// it matches the installed app icon everywhere it appears.
export default function Logo({ size = 36, rounded = true }: { size?: number; rounded?: boolean }) {
  return (
    <span
      className={`inline-block shrink-0 overflow-hidden ${rounded ? "rounded-[22%]" : ""}`}
      style={{ width: size, height: size }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icon.svg" alt="CrimeAI" width={size} height={size} className="h-full w-full object-cover" />
    </span>
  );
}
