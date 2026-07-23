// API base for the CrimeAI backend (ask / lookup / incidents routes).
// • Web + local dev: same origin ("" → relative /api/...)
// • Native iOS/Android builds: the app bundle has no server, so calls go
//   to the deployed backend — set NEXT_PUBLIC_API_BASE at build time,
//   e.g. https://api.publicsafetycrimecenter.com
const BASE = process.env.NEXT_PUBLIC_API_BASE || "";

export const apiUrl = (path: string) => `${BASE}${path}`;
