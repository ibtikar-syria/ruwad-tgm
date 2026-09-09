import type { TelegramMessage } from '../telegram/types'

/**
 * Persist a private-chat Message (user → bot or bot → user).
 * In private chats Telegram's chat.id equals the user's id.
 */
export async function storePrivateMessage(
  db: D1Database,
  message: TelegramMessage,
): Promise<void> {
  const chatId = String(message.chat.id)
  const id = `${chatId}:${message.message_id}`
  await db
    .prepare(
      `INSERT INTO all_messages_private
         (id, message_json, message_text, chat_id, notes, created_at)
       VALUES (?, ?, ?, ?, NULL, datetime('now'))
       ON CONFLICT(id) DO UPDATE SET
         message_json = excluded.message_json,
         message_text = excluded.message_text,
         chat_id = excluded.chat_id`,
    )
    .bind(
      id,
      JSON.stringify(message),
      message.text ?? message.caption ?? null,
      chatId,
    )
    .run()
}
