import * as XLSX from 'xlsx'
import type { MessagePoll, PollVote } from './api'
import type { ExportFormat } from './exportAnalytics'

const HEADERS = [
  'Display name',
  'Username',
  'Telegram user ID',
  'Membership ID',
  'Option indexes',
  'Option texts',
] as const

export function exportPollVotesSheet(
  poll: MessagePoll,
  votes: PollVote[],
  format: ExportFormat,
): void {
  const stamp = new Date().toISOString().slice(0, 10)
  const safe = poll.question
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'poll'

  const summaryRows = poll.options.map((opt) => ({
    Option: opt.text,
    Votes: opt.voter_count,
    Percent:
      poll.total_voter_count > 0
        ? Math.round((opt.voter_count / poll.total_voter_count) * 100)
        : 0,
  }))

  const detailRows = votes.map((v) => ({
    'Display name': v.display_name,
    Username: v.username ? `@${v.username}` : '',
    'Telegram user ID': v.user_id,
    'Membership ID': v.membership_id ?? '',
    'Option indexes': v.option_ids.join(', '),
    'Option texts': v.option_ids
      .map((i) => poll.options[i]?.text ?? `Option ${i}`)
      .join(' | '),
  }))

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(summaryRows),
    'Summary',
  )
  XLSX.utils.book_append_sheet(
    workbook,
    detailRows.length > 0
      ? XLSX.utils.json_to_sheet(detailRows, { header: [...HEADERS] })
      : XLSX.utils.aoa_to_sheet([[...HEADERS]]),
    'Votes',
  )

  XLSX.writeFile(workbook, `poll-${safe}-${stamp}.${format}`, {
    bookType: format,
    compression: true,
  })
}
