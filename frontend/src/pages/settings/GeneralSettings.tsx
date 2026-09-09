import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../api'
import { StatusBanner } from '../../components/StatusBanner'

function settingIsOn(value: string | undefined): boolean {
  const v = (value ?? '').trim().toLowerCase()
  return v === '1' || v === 'true' || v === 'yes' || v === 'on'
}

export function GeneralSettings() {
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
          setError(err instanceof Error ? err.message : 'Failed to load settings')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

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
        hint = ' Webhook refreshed so poll votes can be tracked.'
      } else if (pollViaBot && res.webhook_error) {
        hint = (
          <>
            {' '}
            Warning: could not refresh the webhook ({res.webhook_error}). Fix it on the{' '}
            <Link to="../telegram">Telegram tab</Link>.
          </>
        )
      } else if (pollViaBot && res.webhook_refreshed === undefined) {
        // The backend only reports a result when a webhook URL is already registered
        hint = (
          <>
            {' '}
            Set the webhook on the <Link to="../telegram">Telegram tab</Link> so poll answers are
            received.
          </>
        )
      }

      setMessage(
        <>
          Settings saved.
          {hint}
        </>,
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <p className="muted settings-loading">Loading settings…</p>
  }

  return (
    <div className="settings-stack">
      <StatusBanner message={message} error={error} />

      <form className="settings-panel" onSubmit={saveSettings}>
        <div className="settings-panel-head">
          <h2>General</h2>
          <p className="muted">App identity and poll behavior.</p>
        </div>

        <label className="field">
          <span className="field-label">Display name</span>
          <input
            value={appName}
            onChange={(e) => setAppName(e.target.value)}
            placeholder="Group Manager"
          />
        </label>

        <div className="feature-row">
          <div className="feature-copy">
            <div className="feature-title-row">
              <strong>Poll via Bot</strong>
              <span className={`status-chip ${pollViaBot ? 'status-on' : 'status-off'}`}>
                {pollViaBot ? 'On' : 'Off'}
              </span>
            </div>
            <p className="muted feature-desc">
              Delete member polls and re-send them as public bot polls so votes can be tracked. The
              bot needs admin rights with <strong>Delete messages</strong>. Saving while enabled
              refreshes the webhook for <code>poll_answer</code>.
            </p>
          </div>
          <label className="switch">
            <input
              type="checkbox"
              checked={pollViaBot}
              onChange={(e) => setPollViaBot(e.target.checked)}
              aria-label="Enable Poll via Bot"
            />
            <span className="switch-track" aria-hidden="true" />
          </label>
        </div>

        <div className="settings-panel-actions">
          <button type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Save general settings'}
          </button>
        </div>
      </form>
    </div>
  )
}
