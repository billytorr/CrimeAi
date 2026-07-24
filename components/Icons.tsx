// Custom SVG icon set (lucide-style). No emoji anywhere in the app.
import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement> & { size?: number; filled?: boolean };

function S({ size = 22, filled, children, ...rest }: P & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const Heart = ({ filled, ...p }: P) => (
  <S filled={filled} {...p}>
    <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.29 1.51 4.04 3 5.5l7 7Z" />
  </S>
);
export const Comment = (p: P) => (
  <S {...p}>
    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z" />
  </S>
);
export const Share = (p: P) => (
  <S {...p}>
    <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
    <path d="M16 6l-4-4-4 4" />
    <path d="M12 2v13" />
  </S>
);
export const Bookmark = ({ filled, ...p }: P) => (
  <S filled={filled} {...p}>
    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
  </S>
);
export const Plus = (p: P) => (
  <S {...p} strokeWidth={2.4}>
    <path d="M12 5v14M5 12h14" />
  </S>
);
export const Image = (p: P) => (
  <S {...p}>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <circle cx="9" cy="9" r="2" />
    <path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" />
  </S>
);
export const Film = (p: P) => (
  <S {...p}>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M7 3v18M17 3v18M3 7.5h4M3 12h18M3 16.5h4M17 7.5h4M17 16.5h4" />
  </S>
);
export const Thread = (p: P) => (
  <S {...p}>
    <path d="M21 6H8M21 12H8M21 18H8" />
    <circle cx="4" cy="6" r="1" />
    <circle cx="4" cy="12" r="1" />
    <circle cx="4" cy="18" r="1" />
  </S>
);
export const Report = (p: P) => (
  <S {...p}>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <path d="M12 8v4M12 16h.01" />
  </S>
);
export const Newspaper = (p: P) => (
  <S {...p}>
    <path d="M4 22h16a2 2 0 0 0 2-2V4a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v16a2 2 0 0 1-2-2V8" />
    <path d="M8 7h8M8 11h8M8 15h5" />
  </S>
);
export const Pin = (p: P) => (
  <S {...p}>
    <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
    <circle cx="12" cy="10" r="3" />
  </S>
);
export const Verified = (p: P) => (
  <S {...p} filled>
    <path d="m12 2 2.4 1.8 3 .2.2 3L19.4 9.6 21 12l-1.6 2.4.2 3-3 .2L14.4 19.4 12 21l-2.4-1.6-3 .2-.2-3L4.6 14.4 3 12l1.6-2.4-.2-3 3-.2L9.6 4.6 12 3Z" style={{ fill: "rgb(var(--c-blu))" }} stroke="none" />
    <path d="m9 12 2 2 4-4" stroke="#fff" strokeWidth={2.2} />
  </S>
);
export const Settings = (p: P) => (
  <S {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
  </S>
);
export const Phone = (p: P) => (
  <S {...p}>
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92Z" />
  </S>
);
export const Walk = (p: P) => (
  <S {...p}>
    <circle cx="13" cy="4" r="2" />
    <path d="M7 21l3-5 1-4 3 2 2 3M11 12l-2-3 4-1 3 3 2 1" />
  </S>
);
export const Alert = (p: P) => (
  <S {...p}>
    <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
    <path d="M12 9v4M12 17h.01" />
  </S>
);
export const Car = (p: P) => (
  <S {...p}>
    <path d="M5 17H3v-5l2-5h14l2 5v5h-2" />
    <circle cx="7.5" cy="17" r="1.5" />
    <circle cx="16.5" cy="17" r="1.5" />
    <path d="M5 12h14" />
  </S>
);
export const Lock = (p: P) => (
  <S {...p}>
    <rect x="4" y="11" width="16" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </S>
);
export const IdCard = (p: P) => (
  <S {...p}>
    <rect x="2" y="5" width="20" height="14" rx="2" />
    <circle cx="8" cy="11" r="2" />
    <path d="M5.5 16c.5-1.5 1.5-2 2.5-2s2 .5 2.5 2M14 9h5M14 13h5M14 16h3" />
  </S>
);
export const SoundOn = (p: P) => (
  <S {...p}>
    <path d="M11 5 6 9H2v6h4l5 4V5Z" />
    <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" />
  </S>
);
export const SoundOff = (p: P) => (
  <S {...p}>
    <path d="M11 5 6 9H2v6h4l5 4V5Z" />
    <path d="m17 9 5 5M22 9l-5 5" />
  </S>
);
export const Laptop = (p: P) => (
  <S {...p}>
    <rect x="4" y="5" width="16" height="11" rx="1.5" />
    <path d="M2 19h20" />
  </S>
);
export const Eye = (p: P) => (
  <S {...p}>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
    <circle cx="12" cy="12" r="3" />
  </S>
);
export const Flame = (p: P) => (
  <S {...p}>
    <path d="M8.5 14.5A2.5 2.5 0 0 0 11 17c1.4 0 2.5-1.1 2.5-2.5 0-1-.5-2-1.5-3 .3 2-1 2.5-1.5 2 0-1-1-2.5-2-3.5C8 7.5 6 9 6 12a6 6 0 0 0 12 0c0-2.5-1.5-5-4-7 .5 3-2 4.5-3 5.5-1 1-2.5 2.5-2.5 4Z" />
  </S>
);
export const Close = (p: P) => (
  <S {...p} strokeWidth={2.2}>
    <path d="M18 6 6 18M6 6l12 12" />
  </S>
);
export const Send = (p: P) => (
  <S {...p}>
    <path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z" />
  </S>
);
export const Camera = (p: P) => (
  <S {...p}>
    <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3Z" />
    <circle cx="12" cy="13" r="3" />
  </S>
);
export const Bell = (p: P) => (
  <S {...p}>
    <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0" />
  </S>
);
export const Grid = (p: P) => (
  <S {...p}>
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
    <rect x="14" y="14" width="7" height="7" rx="1" />
  </S>
);
export const Chevron = (p: P) => (
  <S {...p}>
    <path d="m9 18 6-6-6-6" />
  </S>
);
export const Logout = (p: P) => (
  <S {...p}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
  </S>
);
export const Live = (p: P) => (
  <S {...p}>
    <circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none" />
    <path d="M16.2 7.8a6 6 0 0 1 0 8.4M7.8 16.2a6 6 0 0 1 0-8.4M19 5a10 10 0 0 1 0 14M5 19A10 10 0 0 1 5 5" />
  </S>
);
export const Search = (p: P) => (
  <S {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m21 21-4.3-4.3" />
  </S>
);
export const Home = (p: P) => (
  <S {...p}>
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5 9.5V21h14V9.5" />
  </S>
);
export const Mail = (p: P) => (
  <S {...p}>
    <rect x="2" y="4" width="20" height="16" rx="2" />
    <path d="m2 7 10 6 10-6" />
  </S>
);
export const Messages = (p: P) => (
  <S {...p}>
    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z" />
    <path d="M8 10h.01M12 10h.01M16 10h.01" />
  </S>
);
export const Edit = (p: P) => (
  <S {...p}>
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z" />
  </S>
);
export const Sun = (p: P) => (
  <S {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
  </S>
);
export const Moon = (p: P) => (
  <S {...p}>
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </S>
);
export const Repost = (p: P) => (
  <S {...p}>
    <path d="m17 2 4 4-4 4" />
    <path d="M3 11v-1a4 4 0 0 1 4-4h14" />
    <path d="m7 22-4-4 4-4" />
    <path d="M21 13v1a4 4 0 0 1-4 4H3" />
  </S>
);
// Protector Plan badge — RED verification, distinct from the blue
// community-verified check. Paid supporters wear this next to their name.
export const ProBadge = (p: P) => (
  <S {...p} filled>
    <path d="m12 2 2.4 1.8 3 .2.2 3L19.4 9.6 21 12l-1.6 2.4.2 3-3 .2L14.4 19.4 12 21l-2.4-1.6-3 .2-.2-3L4.6 14.4 3 12l1.6-2.4-.2-3 3-.2L9.6 4.6 12 3Z" style={{ fill: "#e31e28" }} stroke="none" />
    <path d="m9 12 2 2 4-4" stroke="#fff" strokeWidth={2.2} />
  </S>
);
