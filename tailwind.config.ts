import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Semantic theme tokens — resolved per theme via CSS variables in globals.css.
        // Dark: futuristic cool black + brand red + a little blue.
        // Light: white + brand red + a little blue.
        // NOTE: --c-base (the stage behind the shell) is intentionally NOT
        // exposed as a Tailwind color — naming it `base` would hijack the
        // `text-base` font-size utility and paint input text near-black.
        // Use rgb(var(--c-base)) directly in CSS instead.
        shell: "rgb(var(--c-shell) / <alpha-value>)", // app background
        card: "rgb(var(--c-card) / <alpha-value>)", // raised surface
        card2: "rgb(var(--c-card2) / <alpha-value>)", // higher surface (sheets, popovers)
        ink: "rgb(var(--c-ink) / <alpha-value>)", // primary text
        ink2: "rgb(var(--c-ink2) / <alpha-value>)", // secondary text
        ink3: "rgb(var(--c-ink3) / <alpha-value>)", // muted text
        brand: "rgb(var(--c-brand) / <alpha-value>)", // CrimeAI red (#E31E28)
        blu: "rgb(var(--c-blu) / <alpha-value>)", // brand blue accent (#0059A9)
        signal: {
          green: "#1b7f3a",
          amber: "#d98a00",
          red: "#c0392b",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "Arial", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
