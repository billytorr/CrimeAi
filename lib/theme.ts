"use client";

export type Theme = "dark" | "light";

const KEY = "pscc_theme";

export function getTheme(): Theme {
  if (typeof document === "undefined") return "dark";
  return (document.documentElement.dataset.theme as Theme) || "dark";
}

export function setTheme(t: Theme) {
  document.documentElement.dataset.theme = t;
  try {
    localStorage.setItem(KEY, t);
  } catch {}
  // Keep the browser chrome (address bar / PWA titlebar) in step.
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", t === "light" ? "#ffffff" : "#0a0b10");
  // Let mounted components (e.g. the map) react without a reload.
  window.dispatchEvent(new CustomEvent("pscc:theme", { detail: t }));
}
