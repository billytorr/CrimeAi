import type { Config } from "tailwindcss";
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        shell: "#0a0b10",
        card: "#12141c",
        card2: "#191c26",
        line: "rgba(255,255,255,0.08)",
        ink: "#f2f4f8",
        ink2: "#9aa2b4",
        ink3: "#646d80",
        brand: "#e92a34",
        blu: "#5b9bff",
        ok: "#22c55e",
        warn: "#f59e0b",
      },
      fontFamily: { sans: ["Inter", "system-ui", "sans-serif"] },
    },
  },
  plugins: [],
};
export default config;
