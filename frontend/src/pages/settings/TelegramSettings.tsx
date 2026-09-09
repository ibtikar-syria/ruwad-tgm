import { useEffect, useState, type FormEvent } from 'react'
import { api } from '../../api'
import { StatusBanner } from '../../components/StatusBanner'
import { useI18n, useTranslateRef } from '../../i18n/context'

type WebhookStatus = {
  url: string
  pending_update_count: number
  last_error_message?: string
  last_error_date?: number
  allowed_updates?: string[]
}

export function TelegramSettings() {
  const { t } = useI18n()
  const tRef = useTranslateRef()
  const [webhookUrl, setWebhookUrl] = useState('')
  const [status, setStatus] = useState<WebhookStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function fetchWebhook() {
    const res = await api.webhookInfo()
    setStatus(res.webhook)
    setWebhookUrl(res.webhook.url || res.suggested_url)
  }

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await api.webhookInfo()
        if (cancelled) return
        setStatus(res.webhook)
        setWebhookUrl(res.webhook.url || res.suggested_url)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : tRef.current('telegram.loadFailed'))
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [tRef])

  const connected = Boolean(status?.url)
  const hasError = Boolean(status?.last_error_message)

  async function applyWebhook(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMessage(null)
    setError(null)
    try {
      const res = await api.setWebhook(webhookUrl.trim() || undefined)
      setStatus(res.webhook)
      setWebhookUrl(res.url)
      setMessage(t('telegram.setOk'))
    } catch (err) {
      setError(err instanceof Error ? err.message : t('telegram.setFailed'))
    } finally {
      setBusy(false)
    }
  }

  async function refreshWebhook() {
    setBusy(true)
    setMessage(null)
    setError(null)
    try {
      await fetchWebhook()
      setMessage(t('telegram.refreshedOk'))
    } catch (err) {
      setError(err instanceof Error ? err.message : t('telegram.refreshFailed'))
    } finally {
      setBusy(false)
    }
  }

  async function removeWebhook() {
    if (!confirm(t('telegram.confirmRemove'))) {
      return
    }
    setBusy(true)
    setMessage(null)
    setError(null)
    try {
      await api.deleteWebhook()
      await fetchWebhook()
      setMessage(t('telegram.removedOk'))
    } catch (err) {
      setError(err instanceof Error ? err.message : t('telegram.removeFailed'))
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return <p className="muted settings-loading">{t('telegram.loading')}</p>
  }

  return (
    <div className="settings-stack">
      <StatusBanner message={message} error={error} />

      <form className="settings-panel" onSubmit={applyWebhook}>
        <div className="settings-panel-head">
          <div className="settings-panel-title-row">
            <h2>{t('telegram.heading')}</h2>
            <span
              className={`status-chip ${
                !connected ? 'status-off' : hasError ? 'status-warn' : 'status-on'
              }`}
            >
              {!connected
                ? t('telegram.notSet')
                : hasError
                  ? t('telegram.error')
                  : t('telegram.connected')}
            </span>
          </div>
          <p className="muted">{t('telegram.desc')}</p>
        </div>

        <label className="field">
          <span className="field-label">{t('telegram.url')}</span>
          <input
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
            placeholder="https://your-worker.workers.dev/telegram/webhook"
            required
          />
        </label>

        <div className="meta-grid">
          <div className="meta-item">
            <span className="meta-label">{t('telegram.currentUrl')}</span>
            <span className="meta-value mono">{status?.url || t('common.empty')}</span>
          </div>
          <div className="meta-item">
            <span className="meta-label">{t('telegram.pending')}</span>
            <span className="meta-value">
              {status ? status.pending_update_count : t('common.empty')}
            </span>
          </div>
          {status?.last_error_message && (
            <div className="meta-item meta-item-wide">
              <span className="meta-label">{t('telegram.lastError')}</span>
              <span className="meta-value error">{status.last_error_message}</span>
            </div>
          )}
          {status?.allowed_updates && status.allowed_updates.length > 0 && (
            <div className="meta-item meta-item-wide">
              <span className="meta-label">{t('telegram.allowedUpdates')}</span>
              <div className="tag-row">
                {status.allowed_updates.map((u) => (
                  <span key={u} className="tag">
                    {u}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="settings-panel-actions button-row">
          <button type="submit" disabled={busy}>
            {busy ? t('common.working') : t('telegram.set')}
          </button>
          <button type="button" className="secondary" disabled={busy} onClick={refreshWebhook}>
            {t('telegram.refreshStatus')}
          </button>
          <button
            type="button"
            className="danger"
            disabled={busy || !connected}
            onClick={removeWebhook}
          >
            {t('common.remove')}
          </button>
        </div>
      </form>
    </div>
  )
}
