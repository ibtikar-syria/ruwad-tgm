import { Navigate, Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { api } from '../api'
import { ThemeToggle } from './ThemeToggle'

export function RequireAuth() {
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
    return <div className="page-center muted">Checking session…</div>
  }
  if (state === 'no') {
    return <Navigate to="/login" replace />
  }
  return <Outlet />
}

export function AppShell() {
  const navigate = useNavigate()
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
          <div className="brand">Group Manager</div>
          <ThemeToggle />
          <button
            type="button"
            className="nav-toggle"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span className="nav-toggle-bars" aria-hidden="true" />
          </button>
          <nav className="topnav-links">
            <NavLink to="/chats" onClick={closeMenu}>
              Chats
            </NavLink>
            <NavLink to="/analytics" onClick={closeMenu}>
              Analytics
            </NavLink>
            <NavLink to="/settings" onClick={closeMenu}>
              Settings
            </NavLink>
            <button type="button" className="linkish topnav-logout" onClick={logout}>
              Log out
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
