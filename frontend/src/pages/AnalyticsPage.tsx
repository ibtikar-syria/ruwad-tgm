import { useEffect, useState } from 'react'
import { api, type AnalyticsRow, type Group } from '../api'
import { exportAnalyticsSheet, type ExportFormat } from '../exportAnalytics'
import { useI18n } from '../i18n/context'
import { sortedHashtags, type HashtagCounts } from '../hashtags'

function HashtagCell({ counts, empty }: { counts: HashtagCounts; empty: string }) {
  const tags = sortedHashtags(counts)
  if (tags.length === 0) return <span className="muted">{empty}</span>
  return (
    <div className="hashtag-cell">
      {tags.map(([tag, count]) => (
        <span key={tag} className="hashtag-chip">
          {/* bdi keeps the leading # attached to Latin tags inside RTL text */}
          <bdi className="hashtag-name">{tag}</bdi>
          <span className="hashtag-count">{count}</span>
        </span>
      ))}
    </div>
  )
}

export function AnalyticsPage() {
  const { t } = useI18n()
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
        if (!cancelled) setError(err instanceof Error ? err.message : t('analytics.loadFailed'))
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
      exportAnalyticsSheet(res.analytics, format, scopeLabel, t)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('analytics.exportFailed'))
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="section-page">
      <header className="page-header">
        <div>
          <h1>{t('analytics.title')}</h1>
          <p className="page-subtitle">{t('analytics.subtitle')}</p>
        </div>
      </header>
      <div className="section-toolbar">
        <div className="toolbar-actions">
          <label className="inline-label">
            {t('analytics.group')}
            <select value={chatId} onChange={(e) => setChatId(e.target.value)}>
              <option value="">{t('analytics.allGroups')}</option>
              {groups.map((g) => (
                <option key={g.chat_id} value={g.chat_id}>
                  {g.title || g.chat_id}
                </option>
              ))}
            </select>
          </label>
          <label className="inline-label">
            {t('analytics.exportAs')}
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value as ExportFormat)}
            >
              <option value="xlsx">{t('analytics.formatXlsx')}</option>
              <option value="ods">{t('analytics.formatOds')}</option>
              <option value="csv">{t('analytics.formatCsv')}</option>
            </select>
          </label>
          <button
            type="button"
            disabled={loading || exporting}
            onClick={() => void handleExport()}
          >
            {exporting ? t('analytics.exporting') : t('analytics.export')}
          </button>
        </div>
      </div>

      {error && <p className="error">{error}</p>}
      {loading && <p className="muted">{t('common.loading')}</p>}

      {!loading && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('column.member')}</th>
                <th>{t('column.membershipId')}</th>
                <th>{t('column.messages')}</th>
                <th>{t('column.replies')}</th>
                <th>{t('column.reactions')}</th>
                <th>{t('column.hashtags')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="muted empty-cell">
                    {t('analytics.empty')}
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r.telegram_user_id}>
                  <td data-label={t('column.member')}>
                    <div className="cell-stack">
                      <strong>{r.display_name || r.telegram_user_id}</strong>
                      {r.username && <span className="muted">@{r.username}</span>}
                    </div>
                  </td>
                  <td data-label={t('column.membershipId')}>
                    {r.membership_id || <span className="muted">{t('analytics.unassigned')}</span>}
                  </td>
                  <td data-label={t('column.messages')}>{r.messages_count}</td>
                  <td data-label={t('column.replies')}>{r.replies_count}</td>
                  <td data-label={t('column.reactions')}>{r.reactions_count}</td>
                  <td data-label={t('column.hashtags')}>
                    <HashtagCell counts={r.hashtag_count} empty={t('analytics.noHashtags')} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
