import type { CapacitorConfig } from "@capacitor/cli";

// CrimeAI native shells (iOS App Store + Google Play).
// The web bundle is built with `npm run build:mobile` into out/, then
// synced into the native projects with `npx cap sync`.
const config: CapacitorConfig = {
  appId: "com.pscc.crimeai",
  appName: "CrimeAI",
  webDir: "out",
  backgroundColor: "#0a0b10",
  server: {
    // https scheme so secure-context APIs (camera, crypto) work on Android
    androidScheme: "https",
  },
  ios: {
    contentInset: "never",
    backgroundColor: "#0a0b10",
  },
  android: {
    backgroundColor: "#0a0b10",
  },
};

export default config;
