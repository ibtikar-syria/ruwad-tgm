import type { MemberRow } from '../types'

export type BotDmState = 'awaiting_name'

export async function getBotDmState(
  db: D1Database,
  telegramUserId: string,
): Promise<BotDmState | null> {
  const row = await db
    .prepare(`SELECT state FROM bot_dm_state WHERE telegram_user_id = ?`)
    .bind(telegramUserId)
    .first<{ state: string }>()
  if (!row) return null
  return row.state === 'awaiting_name' ? 'awaiting_name' : null
}

export async function setBotDmState(
  db: D1Database,
  telegramUserId: string,
  state: BotDmState,
): Promise<void> {
  const now = new Date().toISOString()
  await db
    .prepare(
      `INSERT INTO bot_dm_state (telegram_user_id, state, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(telegram_user_id) DO UPDATE SET
         state = excluded.state,
         updated_at = excluded.updated_at`,
    )
    .bind(telegramUserId, state, now)
    .run()
}

export async function clearBotDmState(db: D1Database, telegramUserId: string): Promise<void> {
  await db
    .prepare(`DELETE FROM bot_dm_state WHERE telegram_user_id = ?`)
    .bind(telegramUserId)
    .run()
}

export async function setMemberCustomName(
  db: D1Database,
  telegramUserId: string,
  customName: string,
): Promise<MemberRow> {
  const now = new Date().toISOString()
  const result = await db
    .prepare(
      `UPDATE members SET custom_name = ?, updated_at = ? WHERE telegram_user_id = ?`,
    )
    .bind(customName, now, telegramUserId)
    .run()

  if (!result.meta.changes) {
    throw new Error(`Member ${telegramUserId} not found`)
  }

  const row = await db
    .prepare(`SELECT * FROM members WHERE telegram_user_id = ?`)
    .bind(telegramUserId)
    .first<MemberRow>()

  if (!row) {
    throw new Error(`Member ${telegramUserId} not found after update`)
  }
  return row
}
