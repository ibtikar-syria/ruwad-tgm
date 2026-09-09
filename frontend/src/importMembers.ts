import * as XLSX from 'xlsx'
import type { I18nValue } from './i18n/context'

export type MemberImportRow = {
  row: number
  telegram_user_id: string | null
  username: string | null
  custom_name: string | null
  membership_id: string | null
}

/** Why a row could not be imported. Translated at render time. */
export type SkipReason =
  | { code: 'missingId' }
  | { code: 'invalidId'; id: string }
  | { code: 'noValues' }

export type SkippedRow = { row: number; reason: SkipReason }

export type ParsedMemberFile = {
  rows: MemberImportRow[]
  skipped: SkippedRow[]
  headers: string[]
}

export type ParseErrorCode = 'noSheets' | 'noIdColumn' | 'noValueColumn'

export class MemberFileError extends Error {
  code: ParseErrorCode

  constructor(code: ParseErrorCode) {
    super(code)
    this.name = 'MemberFileError'
    this.code = code
  }
}

export const IMPORT_ACCEPT = '.csv,.xlsx,.xls,.ods,.txt'

/**
 * Header aliases are matched loosely so admins can bring their own sheet, in
 * either language. Telegram-owned columns (display name) are deliberately
 * absent: they are never imported.
 */
const FIELD_ALIASES: Record<keyof Omit<MemberImportRow, 'row'>, string[]> = {
  telegram_user_id: [
    'telegramuserid',
    'telegramid',
    'userid',
    'tgid',
    'id',
    'معرفتيليجرام',
    'معرفمستخدمتيليجرام',
    'معرفالمستخدم',
    'المعرف',
  ],
  username: ['username', 'telegramusername', 'handle', 'user', 'اسمالمستخدم', 'المعرفاللفظي'],
  custom_name: ['customname', 'name', 'fullname', 'alias', 'الاسمالمخصص', 'الاسم', 'اسم'],
  membership_id: [
    'membershipid',
    'membership',
    'employeeid',
    'memberid',
    'رقمالعضوية',
    'العضوية',
    'رقمالعضو',
  ],
}

const ARABIC_DIACRITICS = /[\u064B-\u0652\u0670]/g

function normalizeHeader(header: string): string {
  return header
    .toLowerCase()
    .replace(ARABIC_DIACRITICS, '')
    .replace(/[^\p{L}\p{N}]/gu, '')
}

function buildHeaderMap(headers: string[]): Partial<Record<keyof MemberImportRow, string>> {
  const map: Partial<Record<keyof MemberImportRow, string>> = {}
  for (const header of headers) {
    const normalized = normalizeHeader(header)
    for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
      const key = field as keyof typeof FIELD_ALIASES
      if (map[key]) continue
      if (aliases.includes(normalized)) {
        map[key] = header
        break
      }
    }
  }
  return map
}

function cell(raw: Record<string, unknown>, header: string | undefined): string | null {
  if (!header) return null
  const value = raw[header]
  if (value === null || value === undefined) return null
  const text = String(value).trim()
  return text === '' ? null : text
}

export async function parseMemberFile(file: File): Promise<ParsedMemberFile> {
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array', raw: false })
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) {
    throw new MemberFileError('noSheets')
  }

  const sheet = workbook.Sheets[sheetName]
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })
  const headers = raw.length > 0 ? Object.keys(raw[0]) : []
  const headerMap = buildHeaderMap(headers)

  if (!headerMap.telegram_user_id && !headerMap.username) {
    throw new MemberFileError('noIdColumn')
  }
  if (!headerMap.custom_name && !headerMap.membership_id) {
    throw new MemberFileError('noValueColumn')
  }

  const rows: MemberImportRow[] = []
  const skipped: SkippedRow[] = []

  raw.forEach((entry, index) => {
    const rowNumber = index + 2
    const telegramUserId = cell(entry, headerMap.telegram_user_id)
    const username = cell(entry, headerMap.username)?.replace(/^@/, '') ?? null
    const customName = cell(entry, headerMap.custom_name)
    const membershipId = cell(entry, headerMap.membership_id)

    if (!telegramUserId && !username) {
      // Blank trailing rows are common in spreadsheets — ignore them silently
      if (customName || membershipId) {
        skipped.push({ row: rowNumber, reason: { code: 'missingId' } })
      }
      return
    }
    if (telegramUserId && !/^-?\d+$/.test(telegramUserId)) {
      skipped.push({ row: rowNumber, reason: { code: 'invalidId', id: telegramUserId } })
      return
    }
    if (!customName && !membershipId) {
      skipped.push({ row: rowNumber, reason: { code: 'noValues' } })
      return
    }

    rows.push({
      row: rowNumber,
      telegram_user_id: telegramUserId,
      username,
      custom_name: customName,
      membership_id: membershipId,
    })
  })

  return { rows, skipped, headers }
}

export function downloadMemberTemplate(t: I18nValue['t']): void {
  const columns = memberSheetColumns(t)

  const example = [
    ['123456789', '@ahmad', 'Ahmad Haddad', 'EMP-001'],
    ['987654321', '', 'Lina Saleh', 'EMP-002'],
    ['', '@omar_k', 'Omar Khalil', 'EMP-003'],
  ].map((values) => Object.fromEntries(columns.map((col, i) => [col, values[i]])))

  const worksheet = XLSX.utils.json_to_sheet(example, { header: columns })
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, t('sheet.membersTab'))
  XLSX.writeFile(workbook, 'members-import-example.csv', { bookType: 'csv' })
}

/** Same columns as the import template / example CSV — safe to edit and re-import. */
function memberSheetColumns(t: I18nValue['t']): string[] {
  return [
    t('sheet.telegramUserId'),
    t('sheet.username'),
    t('sheet.customName'),
    t('sheet.membershipId'),
  ]
}

export type MemberExportRow = {
  telegram_user_id: string
  username: string | null
  custom_name: string | null
  membership_id: string | null
}

export function exportMembersSheet(members: MemberExportRow[], t: I18nValue['t']): void {
  const columns = memberSheetColumns(t)
  const rows = members.map((m) => ({
    [columns[0]]: m.telegram_user_id,
    [columns[1]]: m.username ? `@${m.username.replace(/^@/, '')}` : '',
    [columns[2]]: m.custom_name ?? '',
    [columns[3]]: m.membership_id ?? '',
  }))

  const worksheet =
    rows.length > 0
      ? XLSX.utils.json_to_sheet(rows, { header: columns })
      : XLSX.utils.aoa_to_sheet([columns])
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, t('sheet.membersTab'))

  const stamp = new Date().toISOString().slice(0, 10)
  XLSX.writeFile(workbook, `members-export-${stamp}.csv`, { bookType: 'csv' })
}
