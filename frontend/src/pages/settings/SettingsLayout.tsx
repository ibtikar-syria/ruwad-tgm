import { NavLink, Outlet } from 'react-router-dom'

const TABS = [
  { to: 'general', label: 'General' },
  { to: 'telegram', label: 'Telegram' },
  { to: 'members', label: 'Members' },
  { to: 'import', label: 'Import data' },
] as const

export function SettingsLayout() {
  return (
    <div className="section-page settings-page">
      <header className="page-header">
        <div>
          <h1>Settings</h1>
          <p className="page-subtitle">
            App configuration, Telegram connection, and member records.
          </p>
        </div>
      </header>

      <nav className="settings-tabs" aria-label="Settings sections">
        {TABS.map((tab) => (
          <NavLink key={tab.to} to={tab.to}>
            {tab.label}
          </NavLink>
        ))}
      </nav>

      <Outlet />
    </div>
  )
}
