import { useEffect, useState } from 'react'
import { api, type MessagePoll } from '../api'
import { type ExportFormat } from '../exportAnalytics'
import { exportPollVotesSheet } from '../exportPollVotes'
import { useI18n } from '../i18n/context'

export function PollCard({ poll: initial }: { poll: MessagePoll }) {
  const { t } = useI18n()
  const [poll, setPoll] = useState(initial)
  const [exporting, setExporting] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [format, setFormat] = useState<ExportFormat>('xlsx')
  const [error, setError] = useState<string | null>(null)
  const [hint, setHint] = useState<string | null>(null)

  useEffect(() => {
    setPoll(initial)
  }, [initial])

  const total = Math.max(poll.total_voter_count, 0)
  const votersByOption = poll.options.map((_, idx) =>
    (poll.votes ?? []).filter((v) => v.option_ids.includes(idx)),
  )
  const hasNamedVotes = !poll.is_anonymous && (poll.votes?.length ?? 0) > 0

  async function handleRefresh() {
    setRefreshing(true)
    setError(null)
    setHint(null)
    try {
      const res = await api.refreshPoll(poll.id)
      setPoll(res.poll)
      setHint(t('poll.refreshed'))
    } catch (err) {
      setError(err instanceof Error ? err.message : t('poll.refreshFailed'))
    } finally {
      setRefreshing(false)
    }
  }

  async function handleExport() {
    setExporting(true)
    setError(null)
    try {
      const res = await api.poll(poll.id)
      setPoll(res.poll)
      exportPollVotesSheet(res.poll, res.poll.votes ?? [], format, t)
    } catch (err) {
      try {
        exportPollVotesSheet(poll, poll.votes ?? [], format, t)
      } catch {
        setError(err instanceof Error ? err.message : t('poll.exportFailed'))
      }
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="poll-card">
      <div className="poll-question">{poll.question}</div>
      <ul className="poll-options">
        {poll.options.map((opt, idx) => {
          const count = Math.max(opt.voter_count, votersByOption[idx]?.length ?? 0)
          const pct = total > 0 ? Math.round((count / total) * 100) : 0
          const voters = votersByOption[idx]
          return (
            <li key={`${poll.id}-${idx}`} className="poll-option">
              <div className="poll-option-top">
                <span className="poll-option-text">{opt.text}</span>
                <span className="poll-option-meta muted">
                  {count} · {pct}%
                </span>
              </div>
              <div className="poll-bar" aria-hidden="true">
                <div className="poll-bar-fill" style={{ width: `${pct}%` }} />
              </div>
              {!poll.is_anonymous && voters.length > 0 && (
                <div className="poll-voters muted">
                  {voters.map((v) => v.display_name).join(', ')}
                </div>
              )}
            </li>
          )
        })}
      </ul>
      <div className="poll-footer muted">
        {total === 1 ? t('poll.votesOne') : t('poll.votesMany', { count: total })}
        {poll.allows_multiple_answers ? ` · ${t('poll.multiple')}` : ''}
        {poll.is_anonymous ? ` · ${t('poll.anonymous')}` : ` · ${t('poll.public')}`}
        {poll.is_closed ? ` · ${t('poll.closed')}` : ''}
      </div>
      {!hasNamedVotes && (
        <p className="poll-hint muted">{t('poll.hint')}</p>
      )}
      <div className="poll-export">
        <button
          type="button"
          className="secondary"
          disabled={refreshing}
          onClick={() => void handleRefresh()}
        >
          {refreshing ? t('chats.refreshing') : t('poll.refreshVotes')}
        </button>
        <select
          value={format}
          onChange={(e) => setFormat(e.target.value as ExportFormat)}
          aria-label={t('poll.exportFormat')}
        >
          <option value="xlsx">Excel</option>
          <option value="ods">ODS</option>
          <option value="csv">CSV</option>
        </select>
        <button type="button" disabled={exporting} onClick={() => void handleExport()}>
          {exporting ? t('analytics.exporting') : t('poll.exportVotes')}
        </button>
      </div>
      {hint && <p className="ok">{hint}</p>}
      {error && <p className="error">{error}</p>}
    </div>
  )
}
