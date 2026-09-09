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
          <LanguageToggle />
          <ThemeToggle />
          <button
            type="button"
            className="nav-toggle"
            aria-label={menuOpen ? t('nav.closeMenu') : t('nav.openMenu')}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span className="nav-toggle-bars" aria-hidden="true" />
          </button>
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
            <button type="button" className="linkish topnav-logout" onClick={logout}>
              {t('auth.logout')}
            </button>
          </nav>
        </div>
      </header>
      <main className="shell-main">
        <Outlet />
      </main>
    </div>
  )
}
