import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { ar } from './ar'
import { en } from './en'
import {
  I18nContext,
  LANGUAGE_STORAGE_KEY,
  readStoredLanguage,
  type I18nValue,
  type Language,
  type TranslationKey,
  type TranslationVars,
} from './context'

const DICTIONARIES: Record<Language, Record<TranslationKey, string>> = { en, ar }

function interpolate(template: string, vars?: TranslationVars): string {
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  )
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Language>(readStoredLanguage)
  const dir = lang === 'ar' ? 'rtl' : 'ltr'

  useEffect(() => {
    document.documentElement.lang = lang
    document.documentElement.dir = dir
    try {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, lang)
    } catch {
      /* private mode — the language still applies for this session */
    }
  }, [lang, dir])

  const value = useMemo<I18nValue>(
    () => ({
      lang,
      dir,
      locale: lang === 'ar' ? 'ar-u-nu-latn' : 'en',
      setLang,
      t: (key, vars) => interpolate(DICTIONARIES[lang][key] ?? en[key] ?? key, vars),
    }),
    [lang, dir],
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}
