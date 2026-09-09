import { useEffect, useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { LanguageToggle } from '../components/LanguageToggle'
import { ThemeToggle } from '../components/ThemeToggle'
import { useI18n } from '../i18n/context'

export function LoginPage() {
  const navigate = useNavigate()
  const { t } = useI18n()
  const [secret, setSecret] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [alreadyAuth, setAlreadyAuth] = useState<boolean | null>(null)

  useEffect(() => {
    let cancelled = false
    api
      .me()
      .then(() => {
        if (!cancelled) setAlreadyAuth(true)
      })
      .catch(() => {
        if (!cancelled) setAlreadyAuth(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await api.login(secret)
      navigate('/chats', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.failed'))
    } finally {
      setLoading(false)
    }
  }

  if (alreadyAuth === null) {
    return <div className="page-center muted">{t('common.loading')}</div>
  }
  if (alreadyAuth) {
    return <Navigate to="/chats" replace />
  }

  return (
    <div className="login-page">
      <div className="login-theme">
        <LanguageToggle />
        <ThemeToggle />
      </div>
      <form className="login-form" onSubmit={onSubmit}>
        <h1>{t('app.brand')}</h1>
        <p className="muted">{t('auth.subtitle')}</p>
        <label>
          {t('auth.secret')}
          <input
            type="password"
            autoComplete="current-password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            required
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={loading || !secret}>
          {loading ? t('auth.signingIn') : t('auth.signIn')}
        </button>
      </form>
    </div>
  )
}
