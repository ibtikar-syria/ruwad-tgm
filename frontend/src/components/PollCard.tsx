import { useEffect, useState } from 'react'
import { api, type MessagePoll } from '../api'
import { type ExportFormat } from '../exportAnalytics'
import { exportPollVotesSheet } from '../exportPollVotes'

export function PollCard({ poll: initial }: { poll: MessagePoll }) {
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
      setHint('Poll totals refreshed from Telegram.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Refresh failed')
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
      exportPollVotesSheet(res.poll, res.poll.votes ?? [], format)
    } catch (err) {
      try {
        exportPollVotesSheet(poll, poll.votes ?? [], format)
      } catch {
        setError(err instanceof Error ? err.message : 'Export failed')
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
        {total} vote{total === 1 ? '' : 's'}
        {poll.allows_multiple_answers ? ' · multiple answers' : ''}
        {poll.is_anonymous ? ' · anonymous' : ' · public votes'}
        {poll.is_closed ? ' · closed' : ''}
      </div>
      {!hasNamedVotes && (
        <p className="poll-hint muted">
          Refresh pulls current option totals from Telegram. Named voters only
          appear for public polls created with <code>/poll</code>.
        </p>
      )}
      <div className="poll-export">
        <button
          type="button"
          className="secondary"
          disabled={refreshing}
          onClick={() => void handleRefresh()}
        >
          {refreshing ? 'Refreshing…' : 'Refresh votes'}
        </button>
        <select
          value={format}
          onChange={(e) => setFormat(e.target.value as ExportFormat)}
          aria-label="Export format"
        >
          <option value="xlsx">Excel</option>
          <option value="ods">ODS</option>
          <option value="csv">CSV</option>
        </select>
        <button type="button" disabled={exporting} onClick={() => void handleExport()}>
          {exporting ? 'Exporting…' : 'Export votes'}
        </button>
      </div>
      {hint && <p className="ok">{hint}</p>}
      {error && <p className="error">{error}</p>}
    </div>
  )
}
