import type { CloudflareBindings, MemberRow } from '../types'
import type { TelegramChat, TelegramUser } from '../telegram/types'

function displayName(user: TelegramUser): string {
  const parts = [user.first_name, user.last_name].filter(Boolean)
  return parts.join(' ') || user.username || String(user.id)
}

export async function upsertGroup(
  db: D1Database,
  chat: TelegramChat,
  isActive = true,
): Promise<void> {
  const chatId = String(chat.id)
  const now = new Date().toISOString()
  await db
    .prepare(
      `INSERT INTO groups (chat_id, title, username, is_active, added_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(chat_id) DO UPDATE SET
         title = excluded.title,
         username = excluded.username,
         is_active = excluded.is_active,
         updated_at = excluded.updated_at`,
    )
    .bind(chatId, chat.title ?? null, chat.username ?? null, isActive ? 1 : 0, now, now)
    .run()
}

export async function upsertMember(
  db: D1Database,
  user: TelegramUser,
): Promise<MemberRow> {
  const telegramUserId = String(user.id)
  const now = new Date().toISOString()
  const name = displayName(user)
  const id = crypto.randomUUID()

  await db
    .prepare(
      `INSERT INTO members (id, telegram_user_id, membership_id, display_name, username, first_seen_at, updated_at)
       VALUES (?, ?, NULL, ?, ?, ?, ?)
       ON CONFLICT(telegram_user_id) DO UPDATE SET
         display_name = excluded.display_name,
         username = excluded.username,
         updated_at = excluded.updated_at`,
    )
    .bind(id, telegramUserId, name, user.username ?? null, now, now)
    .run()

  const row = await db
    .prepare(`SELECT * FROM members WHERE telegram_user_id = ?`)
    .bind(telegramUserId)
    .first<MemberRow>()

  if (!row) {
    throw new Error(`Failed to upsert member ${telegramUserId}`)
  }
  return row
}

export async function upsertGroupMember(
  db: D1Database,
  chatId: string,
  telegramUserId: string,
): Promise<void> {
  const now = new Date().toISOString()
  await db
    .prepare(
      `INSERT INTO group_members (chat_id, telegram_user_id, joined_at, is_active)
       VALUES (?, ?, ?, 1)
       ON CONFLICT(chat_id, telegram_user_id) DO UPDATE SET
         is_active = 1`,
    )
    .bind(chatId, telegramUserId, now)
    .run()
}

export async function ensureMemberStats(
  db: D1Database,
  chatId: string,
  telegramUserId: string,
): Promise<void> {
  const now = new Date().toISOString()
  await db
    .prepare(
      `INSERT INTO member_stats (chat_id, telegram_user_id, messages_count, replies_count, reactions_count, updated_at)
       VALUES (?, ?, 0, 0, 0, ?)
       ON CONFLICT(chat_id, telegram_user_id) DO NOTHING`,
    )
    .bind(chatId, telegramUserId, now)
    .run()
}

export async function incrementStats(
  db: D1Database,
  chatId: string,
  telegramUserId: string,
  deltas: { messages?: number; replies?: number; reactions?: number },
): Promise<void> {
  await ensureMemberStats(db, chatId, telegramUserId)
  const now = new Date().toISOString()
  await db
    .prepare(
      `UPDATE member_stats SET
         messages_count = MAX(0, messages_count + ?),
         replies_count = MAX(0, replies_count + ?),
         reactions_count = MAX(0, reactions_count + ?),
         updated_at = ?
       WHERE chat_id = ? AND telegram_user_id = ?`,
    )
    .bind(
      deltas.messages ?? 0,
      deltas.replies ?? 0,
      deltas.reactions ?? 0,
      now,
      chatId,
      telegramUserId,
    )
    .run()
}

export function reactionEmoji(reaction: { type: string; emoji?: string; custom_emoji_id?: string }): string {
  if (reaction.type === 'emoji' && reaction.emoji) return reaction.emoji
  if (reaction.type === 'custom_emoji' && reaction.custom_emoji_id) {
    return `custom:${reaction.custom_emoji_id}`
  }
  return reaction.type
}

export function reactionDelta(
  oldReaction: { type: string; emoji?: string; custom_emoji_id?: string }[],
  newReaction: { type: string; emoji?: string; custom_emoji_id?: string }[],
): { added: string[]; removed: string[] } {
  const oldSet = new Set(oldReaction.map(reactionEmoji))
  const newSet = new Set(newReaction.map(reactionEmoji))
  const added = [...newSet].filter((e) => !oldSet.has(e))
  const removed = [...oldSet].filter((e) => !newSet.has(e))
  return { added, removed }
}

export type EnvDbs = Pick<CloudflareBindings, 'TELEGRAM_MESSAGES_DB' | 'MAIN_DB'>
