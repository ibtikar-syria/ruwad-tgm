import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../api'
import { StatusBanner } from '../../components/StatusBanner'
import { useI18n, useTranslateRef } from '../../i18n/context'

function settingIsOn(value: string | undefined): boolean {
  const v = (value ?? '').trim().toLowerCase()
  return v === '1' || v === 'true' || v === 'yes' || v === 'on'
}

export function GeneralSettings() {
  const { t } = useI18n()
  const tRef = useTranslateRef()
  const [appName, setAppName] = useState('')
  const [pollViaBot, setPollViaBot] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<ReactNode>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await api.settings()
        if (cancelled) return
        setAppName(res.settings.app_name ?? '')
        setPollViaBot(settingIsOn(res.settings.poll_via_bot))
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : tRef.current('general.loadFailed'))
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [tRef])

  async function saveSettings(e: FormEvent) {
    e.preventDefault()
    setMessage(null)
    setError(null)
    setSaving(true)
    try {
      const res = await api.updateSettings({
        app_name: appName,
        poll_via_bot: pollViaBot ? 'true' : 'false',
      })

      let hint: ReactNode = null
      if (pollViaBot && res.webhook_refreshed) {
        hint = ` ${t('general.webhookRefreshed')}`
      } else if (pollViaBot && res.webhook_error) {
        hint = (
          <>
            {' '}
            {t('general.webhookWarn', { error: res.webhook_error })}{' '}
            <Link to="../telegram">{t('general.telegramTab')}</Link>.
          </>
        )
      } else if (pollViaBot && res.webhook_refreshed === undefined) {
        // The backend only reports a result when a webhook URL is already registered
        hint = (
          <>
            {' '}
            {t('general.webhookMissing')} <Link to="../telegram">{t('general.telegramTab')}</Link>{' '}
            {t('general.webhookMissingTail')}
          </>
        )
      }

      setMessage(
        <>
          {t('general.saved')}
          {hint}
        </>,
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : t('general.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <p className="muted settings-loading">{t('common.loading')}</p>
  }

  return (
    <div className="settings-stack">
      <StatusBanner message={message} error={error} />

      <form className="settings-panel" onSubmit={saveSettings}>
        <div className="settings-panel-head">
          <h2>{t('general.heading')}</h2>
          <p className="muted">{t('general.desc')}</p>
        </div>

        <label className="field">
          <span className="field-label">{t('general.displayName')}</span>
          <input
            value={appName}
            onChange={(e) => setAppName(e.target.value)}
            placeholder="Group Manager"
          />
        </label>

        <div className="feature-row">
          <div className="feature-copy">
            <div className="feature-title-row">
              <strong>{t('general.pollViaBot')}</strong>
              <span className={`status-chip ${pollViaBot ? 'status-on' : 'status-off'}`}>
                {pollViaBot ? t('general.on') : t('general.off')}
              </span>
            </div>
            <p className="muted feature-desc">{t('general.pollViaBotDesc')}</p>
          </div>
          <label className="switch">
            <input
              type="checkbox"
              checked={pollViaBot}
              onChange={(e) => setPollViaBot(e.target.checked)}
              aria-label={t('general.enableAria')}
            />
            <span className="switch-track" aria-hidden="true" />
          </label>
        </div>

        <div className="settings-panel-actions">
          <button type="submit" disabled={saving}>
            {saving ? t('common.saving') : t('general.save')}
          </button>
        </div>
      </form>
    </div>
  )
}
