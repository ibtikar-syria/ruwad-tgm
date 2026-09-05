import { Navigate, Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { api } from '../api'

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

  async function logout() {
    try {
      await api.logout()
    } finally {
      navigate('/login', { replace: true })
    }
  }

  return (
    <div className="shell">
      <header className="topnav">
        <div className="brand">Group Manager</div>
        <nav>
          <NavLink to="/groups">Groups</NavLink>
          <NavLink to="/analytics">Analytics</NavLink>
          <NavLink to="/settings">Settings</NavLink>
        </nav>
        <button type="button" className="linkish" onClick={logout}>
          Log out
        </button>
      </header>
      <main className="shell-main">
        <Outlet />
      </main>
    </div>
  )
}
