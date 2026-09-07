import type { MessagePoll } from '../api'

export function PollCard({ poll }: { poll: MessagePoll }) {
  const total = Math.max(poll.total_voter_count, 0)
  const votersByOption = poll.options.map((_, idx) =>
    poll.votes.filter((v) => v.option_ids.includes(idx)),
  )

  return (
    <div className="poll-card">
      <div className="poll-question">{poll.question}</div>
      <ul className="poll-options">
        {poll.options.map((opt, idx) => {
          const pct = total > 0 ? Math.round((opt.voter_count / total) * 100) : 0
          const voters = votersByOption[idx]
          return (
            <li key={`${poll.id}-${idx}`} className="poll-option">
              <div className="poll-option-top">
                <span className="poll-option-text">{opt.text}</span>
                <span className="poll-option-meta muted">
                  {opt.voter_count} · {pct}%
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
        {poll.total_voter_count} vote{poll.total_voter_count === 1 ? '' : 's'}
        {poll.allows_multiple_answers ? ' · multiple answers' : ''}
        {poll.is_anonymous ? ' · anonymous' : ' · public votes'}
        {poll.is_closed ? ' · closed' : ''}
      </div>
    </div>
  )
}
