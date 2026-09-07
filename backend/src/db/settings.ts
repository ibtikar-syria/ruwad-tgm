import type { CloudflareBindings } from '../types'

export async function getSetting(
  db: D1Database,
  key: string,
): Promise<string | null> {
  const row = await db
    .prepare(`SELECT value FROM settings WHERE key = ?`)
    .bind(key)
    .first<{ value: string }>()
  return row?.value ?? null
}

export function settingEnabled(value: string | null | undefined): boolean {
  if (!value) return false
  const v = value.trim().toLowerCase()
  return v === '1' || v === 'true' || v === 'yes' || v === 'on'
}

export async function isPollViaBotEnabled(env: CloudflareBindings): Promise<boolean> {
  const value = await getSetting(env.MAIN_DB, 'poll_via_bot')
  return settingEnabled(value)
}
