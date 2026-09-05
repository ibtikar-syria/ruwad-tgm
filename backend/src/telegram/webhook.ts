import type { Context } from 'hono'
import {
  incrementStats,
  reactionDelta,
  upsertGroup,
  upsertGroupMember,
  upsertMember,
} from '../db/members'
import type { CloudflareBindings } from '../types'
import { sendMessage } from './api'
import { formatInfoMessageHtml, isInfoCommand } from './info'
import type {
  TelegramMessage,
  TelegramMessageReactionUpdated,
  TelegramUpdate,
} from './types'

function isGroupChat(type: string): boolean {
  return type === 'group' || type === 'supergroup'
}

async function replyWithInfo(env: CloudflareBindings, message: TelegramMessage): Promise<void> {
  if (!env.TELEGRAM_BOT_TOKEN) return
  const result = await sendMessage(env.TELEGRAM_BOT_TOKEN, {
    chat_id: message.chat.id,
    text: formatInfoMessageHtml(message),
    parse_mode: 'HTML',
    reply_to_message_id: message.message_id,
    ...(typeof message.message_thread_id === 'number'
      ? { message_thread_id: message.message_thread_id }
      : {}),
  })
  if (!result.ok) {
    console.error('Failed to reply with /info', result.description)
  }
}

async function handleMessage(
  env: CloudflareBindings,
  message: TelegramMessage,
  countStats: boolean,
): Promise<void> {
  const chat = message.chat
  const chatId = String(chat.id)
  const shouldReplyInfo = countStats && isInfoCommand(message.text)

  if (chat.type === 'private') {
    if (!message.from) return
    const id = `${chatId}:${message.message_id}`
    await env.TELEGRAM_MESSAGES_DB.prepare(
      `INSERT INTO all_messages_private (id, message_json, message_text, chat_id, notes, created_at)
       VALUES (?, ?, ?, ?, NULL, datetime('now'))
       ON CONFLICT(id) DO UPDATE SET
         message_json = excluded.message_json,
         message_text = excluded.message_text`,
    )
      .bind(
        id,
        JSON.stringify(message),
        message.text ?? message.caption ?? null,
        chatId,
      )
      .run()

    if (shouldReplyInfo) {
      await replyWithInfo(env, message)
    }
    return
  }

  if (!isGroupChat(chat.type) || !message.from || message.from.is_bot) return

  await upsertGroup(env.MAIN_DB, chat, true)
  const member = await upsertMember(env.MAIN_DB, message.from)
  await upsertGroupMember(env.MAIN_DB, chatId, member.telegram_user_id)

  const id = `${chatId}:${message.message_id}`
  const existing = countStats
    ? await env.TELEGRAM_MESSAGES_DB.prepare(
        `SELECT id FROM all_messages_groups WHERE id = ?`,
      )
        .bind(id)
        .first()
    : null

  await env.TELEGRAM_MESSAGES_DB.prepare(
    `INSERT INTO all_messages_groups
       (id, message_json, message_text, chat_id, user_id, message_thread_id, notes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, NULL, datetime('now'))
     ON CONFLICT(id) DO UPDATE SET
       message_json = excluded.message_json,
       message_text = excluded.message_text`,
  )
    .bind(
      id,
      JSON.stringify(message),
      message.text ?? message.caption ?? null,
      chatId,
      member.telegram_user_id,
      message.message_thread_id != null ? String(message.message_thread_id) : null,
    )
    .run()

  if (countStats && !existing) {
    await incrementStats(env.MAIN_DB, chatId, member.telegram_user_id, {
      messages: 1,
      replies: message.reply_to_message ? 1 : 0,
    })
  }

  if (shouldReplyInfo) {
    await replyWithInfo(env, message)
  }
}

async function handleReaction(
  env: CloudflareBindings,
  reaction: TelegramMessageReactionUpdated,
): Promise<void> {
  const chat = reaction.chat
  if (!isGroupChat(chat.type)) return

  const user = reaction.user
  if (!user || user.is_bot) return

  await upsertGroup(env.MAIN_DB, chat, true)
  const member = await upsertMember(env.MAIN_DB, user)
  const chatId = String(chat.id)
  await upsertGroupMember(env.MAIN_DB, chatId, member.telegram_user_id)

  const { added, removed } = reactionDelta(reaction.old_reaction, reaction.new_reaction)
  const messageId = String(reaction.message_id)

  for (const emoji of added) {
    const id = crypto.randomUUID()
    await env.TELEGRAM_MESSAGES_DB.prepare(
      `INSERT INTO all_reactions_groups
         (id, chat_id, message_id, user_id, emoji, action, reaction_json, created_at)
       VALUES (?, ?, ?, ?, ?, 'add', ?, datetime('now'))`,
    )
      .bind(id, chatId, messageId, member.telegram_user_id, emoji, JSON.stringify(reaction))
      .run()
  }

  for (const emoji of removed) {
    const id = crypto.randomUUID()
    await env.TELEGRAM_MESSAGES_DB.prepare(
      `INSERT INTO all_reactions_groups
         (id, chat_id, message_id, user_id, emoji, action, reaction_json, created_at)
       VALUES (?, ?, ?, ?, ?, 'remove', ?, datetime('now'))`,
    )
      .bind(id, chatId, messageId, member.telegram_user_id, emoji, JSON.stringify(reaction))
      .run()
  }

  const net = added.length - removed.length
  if (net !== 0) {
    await incrementStats(env.MAIN_DB, chatId, member.telegram_user_id, {
      reactions: net,
    })
  }
}

async function handleMyChatMember(
  env: CloudflareBindings,
  update: NonNullable<TelegramUpdate['my_chat_member']>,
): Promise<void> {
  const chat = update.chat
  if (!isGroupChat(chat.type)) return

  const status = update.new_chat_member.status
  const isActive = status !== 'left' && status !== 'kicked'
  await upsertGroup(env.MAIN_DB, chat, isActive)
}

export async function handleTelegramUpdate(
  env: CloudflareBindings,
  update: TelegramUpdate,
): Promise<void> {
  if (update.message) {
    await handleMessage(env, update.message, true)
  }
  if (update.edited_message) {
    await handleMessage(env, update.edited_message, false)
  }
  if (update.message_reaction) {
    await handleReaction(env, update.message_reaction)
  }
  if (update.my_chat_member) {
    await handleMyChatMember(env, update.my_chat_member)
  }
}

export async function telegramWebhookHandler(c: Context<{ Bindings: CloudflareBindings }>) {
  const secret = c.req.header('X-Telegram-Bot-Api-Secret-Token')
  if (!secret || secret !== c.env.TELEGRAM_WEBHOOK_SECRET) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  let update: TelegramUpdate
  try {
    update = await c.req.json<TelegramUpdate>()
  } catch {
    return c.json({ error: 'Invalid JSON' }, 400)
  }

  try {
    await handleTelegramUpdate(c.env, update)
  } catch (err) {
    console.error('Webhook processing error', err)
    return c.json({ error: 'Processing failed' }, 500)
  }

  return c.json({ ok: true })
}
