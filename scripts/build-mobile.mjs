// Builds the static web bundle for the native iOS/Android shells.
//  1. temporarily sets aside app/api (server routes live on the backend)
//  2. next build with output:"export" → out/
//  3. restores app/api
import { execSync } from "node:child_process";
import { existsSync, renameSync } from "node:fs";

const API = "app/api";
const HOLD = ".api-hold";

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
