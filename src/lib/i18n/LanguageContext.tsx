"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { Dict, Entry, Lang, Vars } from "./types";
import { en } from "./translations/en";
import { ku } from "./translations/ku";

const dictionaries: Record<Lang, Dict> = { en, ku };

function resolve(dict: Dict, path: string): Entry | undefined {
  const parts = path.split(".");
  let node: Entry | Dict | undefined = dict;
  for (const part of parts) {
    if (typeof node !== "object" || node === null) return undefined;
    node = (node as Dict)[part];
  }
  return node as Entry | undefined;
}

function interpolate(str: string, vars?: Vars): string {
  if (!vars) return str;
  return str.replace(/\{(\w+)\}/g, (match, key) => (key in vars ? String(vars[key]) : match));
}

type LanguageValue = {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: string, vars?: Vars) => string;
};

const LanguageCtx = createContext<LanguageValue | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  // Start in English on every render (server and first client paint) to avoid a
  // hydration mismatch, then swap to the saved language right after mount.
  const [lang, setLangState] = useState<Lang>("en");

  useEffect(() => {
    const saved = window.localStorage.getItem("language");
    if (saved === "en" || saved === "ku") setLangState(saved);
  }, []);

  const setLang = useCallback((next: Lang) => {
    window.localStorage.setItem("language", next);
    setLangState(next);
  }, []);

  const t = useCallback(
    (key: string, vars?: Vars): string => {
      const entry = resolve(dictionaries[lang], key) ?? resolve(dictionaries.en, key);
      if (typeof entry === "function") return entry(vars ?? {});
      if (typeof entry === "string") return interpolate(entry, vars);
      return key;
    },
    [lang]
  );

  return <LanguageCtx.Provider value={{ lang, setLang, t }}>{children}</LanguageCtx.Provider>;
}

export function useLanguage() {
  const ctx = useContext(LanguageCtx);
  if (!ctx) throw new Error("useLanguage must be used inside <LanguageProvider>");
  return ctx;
}
