import { NavLink, Outlet } from 'react-router-dom'
import { useI18n, type TranslationKey } from '../../i18n/context'

const TABS: { to: string; label: TranslationKey }[] = [
  { to: 'general', label: 'settings.tabGeneral' },
  { to: 'telegram', label: 'settings.tabTelegram' },
  { to: 'members', label: 'settings.tabMembers' },
  { to: 'import', label: 'settings.tabImport' },
]

export function SettingsLayout() {
  const { t } = useI18n()

  return (
    <div className="section-page settings-page">
      <header className="page-header">
        <div>
          <h1>{t('settings.title')}</h1>
          <p className="page-subtitle">{t('settings.subtitle')}</p>
        </div>
      </header>

      <nav className="settings-tabs" aria-label={t('settings.sections')}>
        {TABS.map((tab) => (
          <NavLink key={tab.to} to={tab.to}>
            {t(tab.label)}
          </NavLink>
        ))}
      </nav>

      <Outlet />
    </div>
  )
}
