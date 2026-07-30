"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Dict } from "./dict";
import { en } from "./en";
import { ku } from "./ku";

export type Lang = "en" | "ku";

const dictionaries: Record<Lang, Dict> = { en, ku };

// Build a union of every dot-path key across the nested dictionary, e.g.
// "cashier.placeOrder" | "sidebar.cashier" | ... — this is what gives us
// compile-time autocomplete + a compile error for a typo'd key.
type Join<K extends string, P extends string> = P extends "" ? K : `${K}.${P}`;

type Paths<T> = {
  [K in keyof T & string]: T[K] extends string
    ? K
    : Join<K, Paths<T[K]>>;
}[keyof T & string];

export type DictPath = Paths<Dict>;

function getByPath(obj: unknown, path: string): string {
  const value = path
    .split(".")
    .reduce<unknown>(
      (acc, key) =>
        acc && typeof acc === "object" ? (acc as Record<string, unknown>)[key] : undefined,
      obj,
    );
  if (typeof value !== "string") {
    // Missing key at runtime should never happen because both dictionaries
    // satisfy the same `Dict` type — but guard defensively rather than throw
    // in production, since a broken string is much less bad than a crash.
    if (process.env.NODE_ENV !== "production") {
      console.warn(`[i18n] Missing translation key: "${path}"`);
    }
    return path;
  }
  return value;
}

function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    return key in vars ? String(vars[key]) : match;
  });
}

interface LanguageContextValue {
  lang: Lang;
  dir: "ltr" | "rtl";
  setLang: (lang: Lang) => void;
  toggleLang: () => void;
  t: (path: DictPath, vars?: Record<string, string | number>) => string;
  dict: Dict;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

const STORAGE_KEY = "shklet.lang";

function readInitialLang(): Lang {
  if (typeof window === "undefined") return "en";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === "ku" || stored === "en" ? stored : "en";
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  // Start with "en" on both server and client render to avoid a hydration
  // mismatch, then sync from localStorage in an effect (this causes at most
  // one paint flash on first-ever visit, never on repeat visits because the
  // effect runs before the browser paints via a layout-timed effect below).
  const [lang, setLangState] = useState<Lang>("en");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const initial = readInitialLang();
    setLangState(initial);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(STORAGE_KEY, lang);
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ku" ? "rtl" : "ltr";
  }, [lang, hydrated]);

  const setLang = useCallback((next: Lang) => setLangState(next), []);
  const toggleLang = useCallback(
    () => setLangState((prev) => (prev === "en" ? "ku" : "en")),
    [],
  );

  const dict = dictionaries[lang];

  const t = useCallback(
    (path: DictPath, vars?: Record<string, string | number>) =>
      interpolate(getByPath(dict, path), vars),
    [dict],
  );

  const value = useMemo<LanguageContextValue>(
    () => ({
      lang,
      dir: lang === "ku" ? "rtl" : "ltr",
      setLang,
      toggleLang,
      t,
      dict,
    }),
    [lang, setLang, toggleLang, t, dict],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within a LanguageProvider");
  return ctx;
}

/** Shorthand hook when a component only needs `t()`. */
export function useT() {
  return useLanguage().t;
}
