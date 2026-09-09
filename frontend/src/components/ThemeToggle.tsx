import type { ReactElement } from 'react'
import { useI18n, type TranslationKey } from '../i18n/context'
import { useTheme, type ThemePreference } from '../theme'

function MonitorIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="2" y="4" width="20" height="13" rx="2" />
      <path d="M8 21h8M12 17v4" strokeLinecap="round" />
    </svg>
  )
}

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path
        d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"
        strokeLinecap="round"
      />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" strokeLinejoin="round" />
    </svg>
  )
}

const OPTIONS: { value: ThemePreference; label: TranslationKey; icon: () => ReactElement }[] = [
  { value: 'system', label: 'theme.system', icon: MonitorIcon },
  { value: 'light', label: 'theme.light', icon: SunIcon },
  { value: 'dark', label: 'theme.dark', icon: MoonIcon },
]

export function ThemeToggle() {
  const { preference, setPreference } = useTheme()
  const { t } = useI18n()

  return (
    <div className="theme-toggle" role="group" aria-label={t('theme.label')}>
      {OPTIONS.map(({ value, label, icon: Icon }) => {
        const active = preference === value
        return (
          <button
            key={value}
            type="button"
            className={active ? 'active' : undefined}
            aria-pressed={active}
            aria-label={t(label)}
            title={t(label)}
            onClick={() => setPreference(value)}
          >
            <Icon />
          </button>
        )
      })}
    </div>
  )
}
