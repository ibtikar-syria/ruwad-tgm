import { useEffect, useState, type FormEvent } from 'react'
import { api, type Member } from '../api'

export function SettingsPage() {
  const [members, setMembers] = useState<Member[]>([])
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [savingId, setSavingId] = useState<string | null>(null)
  const [appName, setAppName] = useState('')
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [membersRes, settingsRes] = await Promise.all([api.members(), api.settings()])
      setMembers(membersRes.members)
      const next: Record<string, string> = {}
      for (const m of membersRes.members) {
        next[m.telegram_user_id] = m.membership_id ?? ''
      }
      setDrafts(next)
      setAppName(settingsRes.settings.app_name ?? '')
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
