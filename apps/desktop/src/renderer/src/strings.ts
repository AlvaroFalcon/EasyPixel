/**
 * All user-facing text lives in i18n/<lang>.ts. `t` is a live binding to the
 * active language: modules read `t.x.y` at render time, and the App remounts
 * its tree when the language changes (see useLanguage).
 */
import { create } from 'zustand';
import { en } from './i18n/en';
import { es, type Strings } from './i18n/es';

export type Language = 'es' | 'en';
export const LANGUAGES: Language[] = ['es', 'en'];

const STRINGS: Record<Language, Strings> = { es, en };
const KEY = 'easypixel.language';

function initialLanguage(): Language {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'es' || saved === 'en') return saved;
  } catch {
    // storage unavailable: fall back to the system language
  }
  const system = typeof navigator !== 'undefined' ? navigator.language : 'en';
  return system.toLowerCase().startsWith('es') ? 'es' : 'en';
}

const startLanguage = initialLanguage();

export let t: Strings = STRINGS[startLanguage];

export const useLanguage = create<{ lang: Language }>(() => ({ lang: startLanguage }));

export function setLanguage(lang: Language): void {
  t = STRINGS[lang];
  try {
    localStorage.setItem(KEY, lang);
  } catch {
    // not persisted; the choice still applies to this session
  }
  if (typeof document !== 'undefined') document.documentElement.lang = lang;
  useLanguage.setState({ lang });
}

if (typeof document !== 'undefined') document.documentElement.lang = startLanguage;

export function fmt(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => String(values[k] ?? `{${k}}`));
}
