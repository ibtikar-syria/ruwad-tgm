import { useEffect, useState, type FormEvent } from 'react'
import { api, type Member } from '../api'

export function SettingsPage() {
  const [members, setMembers] = useState<Member[]>([])
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [savingId, setSavingId] = useState<string | null>(null)
  const [appName, setAppName] = useState('')
  const [webhookUrl, setWebhookUrl] = useState('')
  const [webhookStatus, setWebhookStatus] = useState<{
    url: string
    pending_update_count: number
    last_error_message?: string
    last_error_date?: number
    allowed_updates?: string[]
  } | null>(null)
  const [webhookBusy, setWebhookBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function loadWebhook() {
    const res = await api.webhookInfo()
    setWebhookStatus(res.webhook)
    setWebhookUrl(res.webhook.url || res.suggested_url)
  }

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [membersRes, settingsRes] = await Promise.all([
        api.members(),
        api.settings(),
      ])
      setMembers(membersRes.members)
      const next: Record<string, string> = {}
      for (const m of membersRes.members) {
        next[m.telegram_user_id] = m.membership_id ?? ''
      }
      setDrafts(next)
      setAppName(settingsRes.settings.app_name ?? '')
      await loadWebhook()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load settings')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  async function saveMembership(telegramUserId: string) {
    setSavingId(telegramUserId)
    setMessage(null)
    setError(null)
    try {
      const value = drafts[telegramUserId]?.trim() || null
      await api.updateMembershipId(telegramUserId, value)
      setMessage('Membership ID saved.')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSavingId(null)
    }
  }

  async function saveSettings(e: FormEvent) {
    e.preventDefault()
    setMessage(null)
    setError(null)
    try {
      await api.updateSettings({ app_name: appName })
      setMessage('Settings saved.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    }
  }

  async function applyWebhook(e: FormEvent) {
    e.preventDefault()
    setWebhookBusy(true)
    setMessage(null)
    setError(null)
    try {
      const res = await api.setWebhook(webhookUrl.trim() || undefined)
      setWebhookStatus(res.webhook)
      setWebhookUrl(res.url)
      setMessage('Telegram webhook set.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set webhook')
    } finally {
      setWebhookBusy(false)
    }
  }

  async function refreshWebhook() {
    setWebhookBusy(true)
    setMessage(null)
    setError(null)
    try {
      await loadWebhook()
      setMessage('Webhook status refreshed.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh webhook')
    } finally {
      setWebhookBusy(false)
    }
  }

  async function removeWebhook() {
    if (!confirm('Remove the Telegram webhook? The bot will stop receiving updates.')) {
      return
    }
    setWebhookBusy(true)
    setMessage(null)
    setError(null)
    try {
      await api.deleteWebhook()
      await loadWebhook()
      setMessage('Telegram webhook removed.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove webhook')
    } finally {
      setWebhookBusy(false)
    }
  }

  return (
    <div className="section-page">
      <h1>Settings</h1>
      {message && <p className="ok">{message}</p>}
      {error && <p className="error">{error}</p>}
      {loading && <p className="muted">Loading…</p>}

      {!loading && (
        <>
          <form className="settings-block" onSubmit={saveSettings}>
            <h2>App</h2>
            <label>
              Display name
              <input value={appName} onChange={(e) => setAppName(e.target.value)} />
            </label>
            <button type="submit">Save settings</button>
          </form>

          <form className="settings-block" onSubmit={applyWebhook}>
            <h2>Telegram webhook</h2>
            <p className="muted">
              Registers this backend with Telegram so group messages and reactions are ingested.
              Uses <code>TELEGRAM_WEBHOOK_SECRET</code> from the Worker secrets. URL must be HTTPS
              (deployed Worker or a tunnel).
            </p>
            <label>
              Webhook URL
              <input
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder="https://your-worker.workers.dev/telegram/webhook"
                required
              />
            </label>

            <div className="webhook-status">
              <div>
                <span className="muted">Current: </span>
                {webhookStatus?.url ? (
                  <span className="mono">{webhookStatus.url}</span>
                ) : (
                  <span className="muted">not set</span>
                )}
              </div>
              {webhookStatus && (
                <div className="muted">
                  Pending updates: {webhookStatus.pending_update_count}
                  {webhookStatus.last_error_message && (
                    <>
                      {' '}
                      · Last error: {webhookStatus.last_error_message}
                    </>
                  )}
                </div>
              )}
            </div>

            <div className="button-row">
              <button type="submit" disabled={webhookBusy}>
                {webhookBusy ? 'Working…' : 'Set webhook'}
              </button>
              <button type="button" className="secondary" disabled={webhookBusy} onClick={refreshWebhook}>
                Refresh status
              </button>
              <button type="button" className="danger" disabled={webhookBusy} onClick={removeWebhook}>
                Remove webhook
              </button>
            </div>
          </form>

          <div className="settings-block">
            <h2>Members</h2>
            <p className="muted">
              Assign a membership ID to each Telegram user. This is typed manually by the admin.
            </p>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Member</th>
                    <th>Telegram ID</th>
                    <th>Membership ID</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {members.length === 0 && (
                    <tr>
                      <td colSpan={4} className="muted">
                        No members yet.
                      </td>
                    </tr>
                  )}
                  {members.map((m) => (
                    <tr key={m.telegram_user_id}>
                      <td>
                        <div className="cell-stack">
                          <strong>{m.display_name || m.telegram_user_id}</strong>
                          {m.username && <span className="muted">@{m.username}</span>}
                        </div>
                      </td>
                      <td className="mono">{m.telegram_user_id}</td>
                      <td>
                        <input
                          value={drafts[m.telegram_user_id] ?? ''}
                          onChange={(e) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [m.telegram_user_id]: e.target.value,
                            }))
                          }
                          placeholder="e.g. EMP-001"
                        />
                      </td>
                      <td>
                        <button
                          type="button"
                          disabled={savingId === m.telegram_user_id}
                          onClick={() => saveMembership(m.telegram_user_id)}
                        >
                          {savingId === m.telegram_user_id ? 'Saving…' : 'Save'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
