// Builds the static web bundle for the native iOS/Android shells.
//  1. temporarily sets aside app/api (server routes live on the backend)
//  2. next build with output:"export" → out/
//  3. restores app/api
import { execSync } from "node:child_process";
import { existsSync, renameSync } from "node:fs";

const API = "app/api";
const HOLD = ".api-hold";

// Fall back to .env.local so the value doesn't have to be typed on every
// build. Node doesn't load it the way Next does, so read it here. An
// explicit env var still wins — CI and one-off overrides keep working.
if (!process.env.NEXT_PUBLIC_API_BASE) {
  try {
    const { readFileSync } = await import("node:fs");
    const line = readFileSync(new URL("../.env.local", import.meta.url), "utf8")
      .split("\n").find((l) => l.trim().startsWith("NEXT_PUBLIC_API_BASE="));
    if (line) process.env.NEXT_PUBLIC_API_BASE = line.split("=").slice(1).join("=").trim().replace(/^["']|["']$/g, "");
  } catch { /* no .env.local — fall through to the error below */ }
}

// Still nothing? Refuse. A mobile bundle pointing at localhost ships an app
// that works on this machine and nowhere else, and you only find out from a
// user. Better to fail here.
if (!process.env.NEXT_PUBLIC_API_BASE) {
  console.error("\n✖ NEXT_PUBLIC_API_BASE is required for mobile builds");
  console.error("  e.g. NEXT_PUBLIC_API_BASE=https://api.publicsafetycrimecenter.com npm run build:mobile\n");
  process.exit(1);
}

const restore = () => { if (existsSync(HOLD)) renameSync(HOLD, API); };
process.on("exit", restore);

try {
  if (existsSync(API)) renameSync(API, HOLD);
  execSync("next build", {
    stdio: "inherit",
    env: { ...process.env, BUILD_TARGET: "capacitor" },
  });
  console.log("\n✔ static bundle in out/ — now run: npx cap sync");
} finally {
  restore();
}
