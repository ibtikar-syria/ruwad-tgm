import * as XLSX from 'xlsx'
import type { MessagePoll, PollVote } from './api'
import type { ExportFormat } from './exportAnalytics'
import type { I18nValue } from './i18n/context'

type Translate = I18nValue['t']

export function exportPollVotesSheet(
  poll: MessagePoll,
  votes: PollVote[],
  format: ExportFormat,
  t: Translate,
): void {
  const stamp = new Date().toISOString().slice(0, 10)
  const safe = poll.question
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'poll'

  const headers = [
    t('sheet.displayName'),
    t('sheet.username'),
    t('sheet.telegramUserId'),
    t('sheet.membershipId'),
    t('sheet.optionIndexes'),
    t('sheet.optionTexts'),
  ]

  const summaryRows = poll.options.map((opt) => ({
    [t('sheet.option')]: opt.text,
    [t('sheet.votes')]: opt.voter_count,
    [t('sheet.percent')]:
      poll.total_voter_count > 0
        ? Math.round((opt.voter_count / poll.total_voter_count) * 100)
        : 0,
  }))

  const detailRows = votes.map((v) => ({
    [t('sheet.displayName')]: v.display_name,
    [t('sheet.username')]: v.username ? `@${v.username}` : '',
    [t('sheet.telegramUserId')]: v.user_id,
    [t('sheet.membershipId')]: v.membership_id ?? '',
    [t('sheet.optionIndexes')]: v.option_ids.join(', '),
    [t('sheet.optionTexts')]: v.option_ids
      .map((i) => poll.options[i]?.text ?? `${t('sheet.option')} ${i}`)
      .join(' | '),
  }))

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(summaryRows),
    t('sheet.summaryTab'),
  )
  XLSX.utils.book_append_sheet(
    workbook,
    detailRows.length > 0
      ? XLSX.utils.json_to_sheet(detailRows, { header: headers })
      : XLSX.utils.aoa_to_sheet([headers]),
    t('sheet.votesTab'),
  )

  XLSX.writeFile(workbook, `poll-${safe}-${stamp}.${format}`, {
    bookType: format,
    compression: true,
  })
}
