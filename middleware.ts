import { NextResponse, type NextRequest } from "next/server";

// CORS for the CrimeAI API so the native app shells (Capacitor iOS/Android)
// can reach it. Their web origin is cross-origin to this deployment
// (capacitor://localhost on iOS, https://localhost on Android), and a
// cross-origin fetch with no Access-Control-Allow-Origin is blocked by the
// WebView — which is why chat/voice/vision failed on-device ("something
// glitched") while feed/auth worked (those go straight to Supabase, which
// already sends CORS).
//
// We reflect the request Origin. That is safe here: every mutating/user-scoped
// route authenticates with a Bearer JWT in the Authorization header (never a
// cookie), so there are no ambient credentials for another site to ride on —
// a foreign origin can only ever make anonymous, free-tier calls. Same-origin
// web requests are unaffected (the browser ignores these headers for them).

const ALLOW_HEADERS = "authorization, content-type, x-crimeai-lang";
const ALLOW_METHODS = "GET, POST, PUT, PATCH, DELETE, OPTIONS";

export function middleware(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (!origin) return NextResponse.next(); // same-origin / non-browser — nothing to do

  const headers: Record<string, string> = {
    "Access-Control-Allow-Origin": origin,
    "Vary": "Origin",
    "Access-Control-Allow-Methods": ALLOW_METHODS,
    "Access-Control-Allow-Headers": ALLOW_HEADERS,
    "Access-Control-Max-Age": "86400",
  };

  // Preflight — answer directly, no need to hit the route.
  if (req.method === "OPTIONS") return new NextResponse(null, { status: 204, headers });

  const res = NextResponse.next();
  for (const [k, v] of Object.entries(headers)) res.headers.set(k, v);
  return res;
}

export const config = { matcher: "/api/:path*" };
