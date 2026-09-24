import type { MemberRow } from '../types'

export type BotDmState = 'awaiting_name' | 'awaiting_membership_id'

export async function getBotDmState(
  db: D1Database,
  telegramUserId: string,
): Promise<BotDmState | null> {
  const row = await db
    .prepare(`SELECT state FROM bot_dm_state WHERE telegram_user_id = ?`)
    .bind(telegramUserId)
    .first<{ state: string }>()
  if (!row) return null
  if (row.state === 'awaiting_name' || row.state === 'awaiting_membership_id') {
    return row.state
  }
  return null
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

  return requireMember(db, telegramUserId)
}

/** Stores a user-claimed membership ID for admin review — never writes membership_id. */
export async function setPendingMembershipId(
  db: D1Database,
  telegramUserId: string,
  pendingMembershipId: string,
): Promise<MemberRow> {
  const now = new Date().toISOString()
  const result = await db
    .prepare(
      `UPDATE members SET pending_membership_id = ?, updated_at = ?
       WHERE telegram_user_id = ?`,
    )
    .bind(pendingMembershipId, now, telegramUserId)
    .run()

  if (!result.meta.changes) {
    throw new Error(`Member ${telegramUserId} not found`)
  }

  return requireMember(db, telegramUserId)
}

/** Promote pending → membership_id and clear the pending field. */
export async function acceptPendingMembershipId(
  db: D1Database,
  telegramUserId: string,
): Promise<MemberRow> {
  const now = new Date().toISOString()
  const current = await requireMember(db, telegramUserId)
  if (!current.pending_membership_id?.trim()) {
    throw new Error('No pending membership ID')
  }

  await db
    .prepare(
      `UPDATE members
       SET membership_id = pending_membership_id,
           pending_membership_id = NULL,
           updated_at = ?
       WHERE telegram_user_id = ?`,
    )
    .bind(now, telegramUserId)
    .run()

  return requireMember(db, telegramUserId)
}

/** Discard a user-submitted pending membership ID without changing membership_id. */
export async function rejectPendingMembershipId(
  db: D1Database,
  telegramUserId: string,
): Promise<MemberRow> {
  const now = new Date().toISOString()
  const result = await db
    .prepare(
      `UPDATE members SET pending_membership_id = NULL, updated_at = ?
       WHERE telegram_user_id = ? AND pending_membership_id IS NOT NULL`,
    )
    .bind(now, telegramUserId)
    .run()

  if (!result.meta.changes) {
    throw new Error('No pending membership ID')
  }

  return requireMember(db, telegramUserId)
}

async function requireMember(db: D1Database, telegramUserId: string): Promise<MemberRow> {
  const row = await db
    .prepare(`SELECT * FROM members WHERE telegram_user_id = ?`)
    .bind(telegramUserId)
    .first<MemberRow>()

  if (!row) {
    throw new Error(`Member ${telegramUserId} not found`)
  }
  return row
}
