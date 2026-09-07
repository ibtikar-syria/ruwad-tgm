import type { TelegramPoll, TelegramUser } from '../telegram/types'

export async function upsertPoll(
  db: D1Database,
  poll: TelegramPoll,
  meta: {
    chatId: string
    messageDbId?: string | null
    telegramMessageId?: string | null
  },
): Promise<void> {
  const now = new Date().toISOString()
  await db
    .prepare(
      `INSERT INTO polls (
         poll_id, chat_id, message_db_id, telegram_message_id, question, poll_json,
         total_voter_count, is_closed, is_anonymous, allows_multiple_answers, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(poll_id) DO UPDATE SET
         chat_id = excluded.chat_id,
         message_db_id = COALESCE(excluded.message_db_id, polls.message_db_id),
         telegram_message_id = COALESCE(excluded.telegram_message_id, polls.telegram_message_id),
         question = excluded.question,
         poll_json = excluded.poll_json,
         total_voter_count = excluded.total_voter_count,
         is_closed = excluded.is_closed,
         is_anonymous = excluded.is_anonymous,
         allows_multiple_answers = excluded.allows_multiple_answers,
         updated_at = excluded.updated_at`,
    )
    .bind(
      poll.id,
      meta.chatId,
      meta.messageDbId ?? null,
      meta.telegramMessageId ?? null,
      poll.question,
      JSON.stringify(poll),
      poll.total_voter_count,
      poll.is_closed ? 1 : 0,
      poll.is_anonymous ? 1 : 0,
      poll.allows_multiple_answers ? 1 : 0,
      now,
    )
    .run()
}

export async function applyPollUpdateToMessage(
  db: D1Database,
  poll: TelegramPoll,
): Promise<void> {
  const row = await db
    .prepare(`SELECT message_db_id, poll_json FROM polls WHERE poll_id = ?`)
    .bind(poll.id)
    .first<{ message_db_id: string | null; poll_json: string }>()

  if (!row?.message_db_id) return

  const message = await db
    .prepare(`SELECT message_json FROM all_messages_groups WHERE id = ?`)
    .bind(row.message_db_id)
    .first<{ message_json: string }>()

  if (!message) return

  try {
    const parsed = JSON.parse(message.message_json) as Record<string, unknown>
    parsed.poll = poll
    await db
      .prepare(
        `UPDATE all_messages_groups
         SET message_json = ?, message_text = ?
         WHERE id = ?`,
      )
      .bind(JSON.stringify(parsed), poll.question, row.message_db_id)
      .run()
  } catch {
    /* ignore corrupt json */
  }
}

export async function upsertPollVote(
  db: D1Database,
  pollId: string,
  user: TelegramUser,
  optionIds: number[],
  voteJson: string,
): Promise<void> {
  const userId = String(user.id)
  const now = new Date().toISOString()

  if (optionIds.length === 0) {
    await db
      .prepare(`DELETE FROM poll_votes WHERE poll_id = ? AND user_id = ?`)
      .bind(pollId, userId)
      .run()
    return
  }

  await db
    .prepare(
      `INSERT INTO poll_votes (poll_id, user_id, option_ids, vote_json, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(poll_id, user_id) DO UPDATE SET
         option_ids = excluded.option_ids,
         vote_json = excluded.vote_json,
         updated_at = excluded.updated_at`,
    )
    .bind(pollId, userId, JSON.stringify(optionIds), voteJson, now)
    .run()
}
