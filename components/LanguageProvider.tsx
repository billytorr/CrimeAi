"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { type Lang, LANG_STORAGE_KEY, initialLang, detectLang, translate } from "@/lib/i18n";

interface LangCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string) => string;
}

const Ctx = createContext<LangCtx>({ lang: "en", setLang: () => {}, t: (k) => k });

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  // start at "en" for SSR/first paint, then sync to saved/device language on
  // mount (avoids hydration mismatch)
  const [lang, setLangState] = useState<Lang>("en");

  useEffect(() => {
    setLangState(initialLang());
    // if the user hasn't explicitly chosen, keep following the device — so if
    // they change their phone's language, the app follows on next open
    const onVisible = () => {
      if (!localStorage.getItem(LANG_STORAGE_KEY)) setLangState(detectLang());
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  useEffect(() => {
    if (typeof document !== "undefined") document.documentElement.lang = lang;
  }, [lang]);

  const setLang = (l: Lang) => {
    localStorage.setItem(LANG_STORAGE_KEY, l); // explicit choice overrides device
    setLangState(l);
  };

  const t = (key: string) => translate(lang, key);

  return <Ctx.Provider value={{ lang, setLang, t }}>{children}</Ctx.Provider>;
}

export const useLang = () => useContext(Ctx);
// convenience: just the translator
export const useT = () => useContext(Ctx).t;
