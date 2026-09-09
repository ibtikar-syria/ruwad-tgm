import { Navigate, Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { api } from '../api'
import { useI18n } from '../i18n/context'
import { LanguageToggle } from './LanguageToggle'
import { ThemeToggle } from './ThemeToggle'

export function RequireAuth() {
  const { t } = useI18n()
  const [state, setState] = useState<'loading' | 'ok' | 'no'>('loading')

  useEffect(() => {
    let cancelled = false
    api
      .me()
      .then(() => {
        if (!cancelled) setState('ok')
      })
      .catch(() => {
        if (!cancelled) setState('no')
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (state === 'loading') {
    return <div className="page-center muted">{t('auth.checking')}</div>
  }
  if (state === 'no') {
    return <Navigate to="/login" replace />
  }
  return <Outlet />
}

function LogoutIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M15 3h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-3" strokeLinecap="round" />
      <path d="M10 17l5-5-5-5M15 12H3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function AppShell() {
  const navigate = useNavigate()
  const { t } = useI18n()
  const [menuOpen, setMenuOpen] = useState(false)
  const closeMenu = () => setMenuOpen(false)

  async function logout() {
    try {
      await api.logout()
    } finally {
      navigate('/login', { replace: true })
    }
  }

  return (
    <div className={`shell${menuOpen ? ' nav-open' : ''}`}>
      <header className="topnav">
        <div className="topnav-bar">
          <div className="brand">{t('app.brand')}</div>
          <nav className="topnav-links">
            <NavLink to="/chats" onClick={closeMenu}>
              {t('nav.chats')}
            </NavLink>
            <NavLink to="/analytics" onClick={closeMenu}>
              {t('nav.analytics')}
            </NavLink>
            <NavLink to="/settings" onClick={closeMenu}>
              {t('nav.settings')}
            </NavLink>
          </nav>
          <div className="topnav-actions">
            <LanguageToggle />
            <ThemeToggle />
            <button
              type="button"
              className="topnav-logout"
              onClick={logout}
              aria-label={t('auth.logout')}
              title={t('auth.logout')}
            >
              <LogoutIcon />
            </button>
          </div>
          <button
            type="button"
            className="nav-toggle"
            aria-label={menuOpen ? t('nav.closeMenu') : t('nav.openMenu')}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span className="nav-toggle-bars" aria-hidden="true" />
          </button>
        </div>
      </header>
      <main className="shell-main">
        <Outlet />
      </main>
    </div>
  )
}
