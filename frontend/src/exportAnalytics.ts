import * as XLSX from 'xlsx'
import type { AnalyticsRow } from './api'

export type ExportFormat = 'csv' | 'xlsx' | 'ods'

const HEADERS = [
  'Display name',
  'Username',
  'Telegram user ID',
  'Membership ID',
  'Messages',
  'Replies',
  'Reactions',
] as const

function toSheetRows(rows: AnalyticsRow[]) {
  return rows.map((r) => ({
    'Display name': r.display_name ?? '',
    Username: r.username ? `@${r.username}` : '',
    'Telegram user ID': r.telegram_user_id,
    'Membership ID': r.membership_id ?? '',
    Messages: Number(r.messages_count) || 0,
    Replies: Number(r.replies_count) || 0,
    Reactions: Number(r.reactions_count) || 0,
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
): void {
  const sheetRows = toSheetRows(rows)
  const worksheet =
    sheetRows.length > 0
      ? XLSX.utils.json_to_sheet(sheetRows, { header: [...HEADERS] })
      : XLSX.utils.aoa_to_sheet([[...HEADERS]])

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Analytics')

  XLSX.writeFile(workbook, buildFilename(scopeLabel, format), {
    bookType: format,
    compression: true,
  })
}
