import { useEffect, useState } from 'react'
import { api, type AnalyticsRow, type Group } from '../api'
import { exportAnalyticsSheet, type ExportFormat } from '../exportAnalytics'

export function AnalyticsPage() {
  const [groups, setGroups] = useState<Group[]>([])
  const [chatId, setChatId] = useState<string>('')
  const [rows, setRows] = useState<AnalyticsRow[]>([])
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [format, setFormat] = useState<ExportFormat>('xlsx')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .groups()
      .then((res) => setGroups(res.groups))
      .catch(() => {
        /* ignore — analytics still works for all */
      })
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    api
      .analytics(chatId || undefined)
      .then((res) => {
        if (!cancelled) setRows(res.analytics)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load analytics')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [chatId])

  const scopeLabel =
    chatId === ''
      ? 'all-groups'
      : groups.find((g) => g.chat_id === chatId)?.title || chatId

  async function handleExport() {
    setExporting(true)
    setError(null)
    try {
      // Refresh so the sheet matches the latest server data for the selected scope
      const res = await api.analytics(chatId || undefined)
      setRows(res.analytics)
      exportAnalyticsSheet(res.analytics, format, scopeLabel)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="section-page">
      <div className="section-toolbar">
        <h1>Analytics</h1>
        <div className="toolbar-actions">
          <label className="inline-label">
            Group
            <select value={chatId} onChange={(e) => setChatId(e.target.value)}>
              <option value="">All groups</option>
              {groups.map((g) => (
                <option key={g.chat_id} value={g.chat_id}>
                  {g.title || g.chat_id}
                </option>
              ))}
            </select>
          </label>
          <label className="inline-label">
            Export as
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value as ExportFormat)}
            >
              <option value="xlsx">Excel (.xlsx)</option>
              <option value="ods">OpenDocument (.ods)</option>
              <option value="csv">CSV (.csv)</option>
            </select>
          </label>
          <button
            type="button"
            disabled={loading || exporting}
            onClick={() => void handleExport()}
          >
            {exporting ? 'Exporting…' : 'Export sheet'}
          </button>
        </div>
      </div>

      {error && <p className="error">{error}</p>}
      {loading && <p className="muted">Loading…</p>}

      {!loading && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Member</th>
                <th>Membership ID</th>
                <th>Messages</th>
                <th>Replies</th>
                <th>Reactions</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="muted">
                    No member activity yet.
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r.telegram_user_id}>
                  <td>
                    <div className="cell-stack">
                      <strong>{r.display_name || r.telegram_user_id}</strong>
                      {r.username && <span className="muted">@{r.username}</span>}
                    </div>
                  </td>
                  <td>{r.membership_id || <span className="muted">unassigned</span>}</td>
                  <td>{r.messages_count}</td>
                  <td>{r.replies_count}</td>
                  <td>{r.reactions_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
