import * as XLSX from 'xlsx'

export type MemberImportRow = {
  row: number
  telegram_user_id: string | null
  username: string | null
  custom_name: string | null
  membership_id: string | null
  display_name: string | null
}

export type ParsedMemberFile = {
  rows: MemberImportRow[]
  /** Rows present in the file but unusable, with the reason why */
  skipped: { row: number; reason: string }[]
  headers: string[]
}

export const IMPORT_ACCEPT = '.csv,.xlsx,.xls,.ods,.txt'

const TEMPLATE_HEADERS = [
  'Telegram user ID',
  'Username',
  'Custom name',
  'Membership ID',
] as const

/** Header aliases are matched loosely so admins can bring their own sheet. */
const FIELD_ALIASES: Record<keyof Omit<MemberImportRow, 'row'>, string[]> = {
  telegram_user_id: ['telegramuserid', 'telegramid', 'userid', 'tgid', 'id'],
  username: ['username', 'telegramusername', 'handle', 'user'],
  custom_name: ['customname', 'name', 'fullname', 'alias'],
  membership_id: ['membershipid', 'membership', 'employeeid', 'memberid'],
  display_name: ['displayname', 'telegramname'],
}

function normalizeHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, '')
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
    throw new Error('The file has no sheets.')
  }

  const sheet = workbook.Sheets[sheetName]
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })
  const headers = raw.length > 0 ? Object.keys(raw[0]) : []
  const headerMap = buildHeaderMap(headers)

  if (!headerMap.telegram_user_id && !headerMap.username) {
    throw new Error(
      'No "Telegram user ID" or "Username" column found. Download the example CSV for the expected columns.',
    )
  }
  if (!headerMap.custom_name && !headerMap.membership_id) {
    throw new Error(
      'No "Custom name" or "Membership ID" column found. There would be nothing to import.',
    )
  }

  const rows: MemberImportRow[] = []
  const skipped: { row: number; reason: string }[] = []

  raw.forEach((entry, index) => {
    const rowNumber = index + 2
    const telegramUserId = cell(entry, headerMap.telegram_user_id)
    const username = cell(entry, headerMap.username)?.replace(/^@/, '') ?? null
    const customName = cell(entry, headerMap.custom_name)
    const membershipId = cell(entry, headerMap.membership_id)
    const displayName = cell(entry, headerMap.display_name)

    if (!telegramUserId && !username) {
      // Blank trailing rows are common in spreadsheets — ignore them silently
      if (customName || membershipId) {
        skipped.push({ row: rowNumber, reason: 'Missing Telegram user ID and username' })
      }
      return
    }
    if (telegramUserId && !/^-?\d+$/.test(telegramUserId)) {
      skipped.push({ row: rowNumber, reason: `Invalid Telegram user ID "${telegramUserId}"` })
      return
    }
    if (!customName && !membershipId) {
      skipped.push({ row: rowNumber, reason: 'No custom name or membership ID' })
      return
    }

    rows.push({
      row: rowNumber,
      telegram_user_id: telegramUserId,
      username,
      custom_name: customName,
      membership_id: membershipId,
      display_name: displayName,
    })
  })

  return { rows, skipped, headers }
}

export function downloadMemberTemplate(): void {
  const example = [
    {
      'Telegram user ID': '123456789',
      Username: '@ahmad',
      'Custom name': 'Ahmad Haddad',
      'Membership ID': 'EMP-001',
    },
    {
      'Telegram user ID': '987654321',
      Username: '',
      'Custom name': 'Lina Saleh',
      'Membership ID': 'EMP-002',
    },
    {
      'Telegram user ID': '',
      Username: '@omar_k',
      'Custom name': 'Omar Khalil',
      'Membership ID': 'EMP-003',
    },
  ]

  const worksheet = XLSX.utils.json_to_sheet(example, { header: [...TEMPLATE_HEADERS] })
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Members')
  XLSX.writeFile(workbook, 'members-import-example.csv', { bookType: 'csv' })
}
