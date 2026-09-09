import { createContext, useContext, useEffect, useRef } from 'react'
import { en } from './en'

export type Language = 'ar' | 'en'
export type TranslationKey = keyof typeof en
export type TranslationVars = Record<string, string | number>

export const LANGUAGE_STORAGE_KEY = 'language'
export const DEFAULT_LANGUAGE: Language = 'ar'

export type I18nValue = {
  lang: Language
  dir: 'ltr' | 'rtl'
  /** Arabic keeps Latin digits so Telegram IDs and counts stay readable */
  locale: string
  setLang: (lang: Language) => void
  t: (key: TranslationKey, vars?: TranslationVars) => string
}

export const I18nContext = createContext<I18nValue | null>(null)

export function readStoredLanguage(): Language {
  try {
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY)
    return stored === 'en' || stored === 'ar' ? stored : DEFAULT_LANGUAGE
  } catch {
    return DEFAULT_LANGUAGE
  }
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext)
  if (!value) {
    throw new Error('useI18n must be used inside <I18nProvider>')
  }
  return value
}

/**
 * Identity-stable handle on the translator, for mount effects that must not
 * re-run (and discard in-flight edits) when the language changes.
 */
export function useTranslateRef() {
  const { t } = useI18n()
  const ref = useRef(t)
  useEffect(() => {
    ref.current = t
  }, [t])
  return ref
}
