import { useEffect, useState, type FormEvent } from 'react'
import { api } from '../../api'
import { StatusBanner } from '../../components/StatusBanner'

type WebhookStatus = {
  url: string
  pending_update_count: number
  last_error_message?: string
  last_error_date?: number
  allowed_updates?: string[]
}

export function TelegramSettings() {
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
          setError(err instanceof Error ? err.message : 'Failed to load webhook status')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

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
      setMessage('Telegram webhook set.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set webhook')
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
      setMessage('Webhook status refreshed.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh webhook')
    } finally {
      setBusy(false)
    }
  }

  async function removeWebhook() {
    if (!confirm('Remove the Telegram webhook? The bot will stop receiving updates.')) {
      return
    }
    setBusy(true)
    setMessage(null)
    setError(null)
    try {
      await api.deleteWebhook()
      await fetchWebhook()
      setMessage('Telegram webhook removed.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove webhook')
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return <p className="muted settings-loading">Loading webhook status…</p>
  }

  return (
    <div className="settings-stack">
      <StatusBanner message={message} error={error} />

      <form className="settings-panel" onSubmit={applyWebhook}>
        <div className="settings-panel-head">
          <div className="settings-panel-title-row">
            <h2>Telegram webhook</h2>
            <span
              className={`status-chip ${
                !connected ? 'status-off' : hasError ? 'status-warn' : 'status-on'
              }`}
            >
              {!connected ? 'Not set' : hasError ? 'Error' : 'Connected'}
            </span>
          </div>
          <p className="muted">
            Point Telegram at this backend so messages, reactions, and poll votes are ingested. URL
            must be HTTPS. Secret comes from <code>TELEGRAM_WEBHOOK_SECRET</code>.
          </p>
        </div>

        <label className="field">
          <span className="field-label">Webhook URL</span>
          <input
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
            placeholder="https://your-worker.workers.dev/telegram/webhook"
            required
          />
        </label>

        <div className="meta-grid">
          <div className="meta-item">
            <span className="meta-label">Current URL</span>
            <span className="meta-value mono">{status?.url || '—'}</span>
          </div>
          <div className="meta-item">
            <span className="meta-label">Pending updates</span>
            <span className="meta-value">{status ? status.pending_update_count : '—'}</span>
          </div>
          {status?.last_error_message && (
            <div className="meta-item meta-item-wide">
              <span className="meta-label">Last error</span>
              <span className="meta-value error">{status.last_error_message}</span>
            </div>
          )}
          {status?.allowed_updates && status.allowed_updates.length > 0 && (
            <div className="meta-item meta-item-wide">
              <span className="meta-label">Allowed updates</span>
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
            {busy ? 'Working…' : 'Set webhook'}
          </button>
          <button type="button" className="secondary" disabled={busy} onClick={refreshWebhook}>
            Refresh status
          </button>
          <button
            type="button"
            className="danger"
            disabled={busy || !connected}
            onClick={removeWebhook}
          >
            Remove
          </button>
        </div>
      </form>
    </div>
  )
}
