// User avatar: their photo when set, otherwise the brand default —
// a white user silhouette on CrimeAI red (never an initial letter).
// `color` is accepted for call-site compatibility but no longer used.
export default function Avatar({ photo, name, size = 40 }: { photo?: string; name?: string; color?: string; size?: number }) {
  if (photo) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={photo} alt={name || ""} className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />;
  }
  return (
    <span
      className="grid shrink-0 place-items-end justify-items-center overflow-hidden rounded-full"
      style={{ width: size, height: size, background: "#e31e28" }}
      aria-label={name || "User"}
    >
      <svg width={size * 0.66} height={size * 0.66} viewBox="0 0 24 24" fill="#ffffff">
        <circle cx="12" cy="8.2" r="4.6" />
        <path d="M12 14.6c-5 0-8.8 2.8-8.8 6.8V24h17.6v-2.6c0-4-3.8-6.8-8.8-6.8z" />
      </svg>
    </span>
  );
}
