import { useI18n, type Language } from '../i18n/context'

const OPTIONS: { value: Language; label: string; aria: 'language.switchToAr' | 'language.switchToEn' }[] = [
  { value: 'ar', label: 'ع', aria: 'language.switchToAr' },
  { value: 'en', label: 'EN', aria: 'language.switchToEn' },
]

export function LanguageToggle() {
  const { lang, setLang, t } = useI18n()

  return (
    <div className="lang-toggle" role="group" aria-label={t('language.label')}>
      {OPTIONS.map((option) => {
        const active = lang === option.value
        return (
          <button
            key={option.value}
            type="button"
            className={active ? 'active' : undefined}
            aria-pressed={active}
            aria-label={t(option.aria)}
            title={t(option.aria)}
            onClick={() => setLang(option.value)}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
