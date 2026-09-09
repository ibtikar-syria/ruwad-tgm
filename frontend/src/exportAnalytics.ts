import * as XLSX from 'xlsx'
import type { AnalyticsRow } from './api'
import type { I18nValue } from './i18n/context'

export type ExportFormat = 'csv' | 'xlsx' | 'ods'

type Translate = I18nValue['t']

function headers(t: Translate) {
  return [
    t('sheet.displayName'),
    t('sheet.username'),
    t('sheet.telegramUserId'),
    t('sheet.membershipId'),
    t('sheet.messages'),
    t('sheet.replies'),
    t('sheet.reactions'),
  ]
}

function toSheetRows(rows: AnalyticsRow[], t: Translate) {
  return rows.map((r) => ({
    [t('sheet.displayName')]: r.display_name ?? '',
    [t('sheet.username')]: r.username ? `@${r.username}` : '',
    [t('sheet.telegramUserId')]: r.telegram_user_id,
    [t('sheet.membershipId')]: r.membership_id ?? '',
    [t('sheet.messages')]: Number(r.messages_count) || 0,
    [t('sheet.replies')]: Number(r.replies_count) || 0,
    [t('sheet.reactions')]: Number(r.reactions_count) || 0,
  }))
}

function buildFilename(scopeLabel: string, format: ExportFormat): string {
  const stamp = new Date().toISOString().slice(0, 10)
  const safe = scopeLabel
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'all-groups'
  return `analytics-${safe}-${stamp}.${format}`
}

export function exportAnalyticsSheet(
  rows: AnalyticsRow[],
  format: ExportFormat,
  scopeLabel: string,
  t: Translate,
): void {
  const head = headers(t)
  const sheetRows = toSheetRows(rows, t)
  const worksheet =
    sheetRows.length > 0
      ? XLSX.utils.json_to_sheet(sheetRows, { header: head })
      : XLSX.utils.aoa_to_sheet([head])

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, t('sheet.analyticsTab'))

  XLSX.writeFile(workbook, buildFilename(scopeLabel, format), {
    bookType: format,
    compression: true,
  })
}
