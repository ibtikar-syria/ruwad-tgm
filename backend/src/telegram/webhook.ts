import type { Context } from 'hono'
import {
  incrementStats,
  reactionDelta,
  upsertGroup,
  upsertGroupMember,
  upsertMember,
  upsertTopic,
  ensureGeneralTopic,
} from '../db/members'
import {
  applyPollUpdateToMessage,
  upsertPoll,
  upsertPollVote,
} from '../db/polls'
import type { CloudflareBindings } from '../types'
import { deleteMessage, sendMessage, sendPoll } from './api'
import { isPollViaBotEnabled } from '../db/settings'
import { formatInfoMessageHtml, isInfoCommand } from './info'
import { isPollCommand, parsePollCommand } from './pollCommand'
import { extractTopicTitle } from './topicTitle'
import type {
  TelegramMessage,
  TelegramMessageReactionUpdated,
  TelegramPoll,
  TelegramPollAnswer,
  TelegramUpdate,
  TelegramUser,
} from './types'

function isGroupChat(type: string): boolean {
  return type === 'group' || type === 'supergroup'
}

/** Forum General topic uses thread id 1; omit often means General. */
function resolveThreadId(message: TelegramMessage): string | null {
  if (message.message_thread_id != null) {
    return String(message.message_thread_id)
  }
  if (message.chat.is_forum) {
    return '1'
  }
  return null
}

async function syncTopicFromMessage(
  env: CloudflareBindings,
  message: TelegramMessage,
): Promise<void> {
  const chatId = String(message.chat.id)

  if (message.chat.is_forum) {
    await ensureGeneralTopic(env.MAIN_DB, chatId)
  }

  const threadId = resolveThreadId(message)
  if (!threadId) return

  await upsertTopic(env.MAIN_DB, chatId, threadId, {
    title: extractTopicTitle(message),
    isGeneral: threadId === '1',
    markForum: true,
  })
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

async function handlePollCommand(
  env: CloudflareBindings,
  message: TelegramMessage,
): Promise<void> {
  if (!env.TELEGRAM_BOT_TOKEN || !message.text) return
  const parsed = parsePollCommand(message.text)
  if (!parsed) {
    await sendMessage(env.TELEGRAM_BOT_TOKEN, {
      chat_id: message.chat.id,
      text:
        'Usage:\n<code>/poll Question\nOption 1\nOption 2</code>\n\nOr:\n<code>/poll Question | Opt1 | Opt2</code>\n\nUse <code>/pollm</code> to allow multiple answers.\nPolls are public (not anonymous) so votes can be tracked.',
      parse_mode: 'HTML',
      reply_to_message_id: message.message_id,
      ...(typeof message.message_thread_id === 'number'
        ? { message_thread_id: message.message_thread_id }
        : {}),
    })
    return
  }

  const result = await sendPoll(env.TELEGRAM_BOT_TOKEN, {
    chat_id: message.chat.id,
    question: parsed.question,
    options: parsed.options,
    is_anonymous: false,
    allows_multiple_answers: parsed.allowsMultiple,
    ...(typeof message.message_thread_id === 'number'
      ? { message_thread_id: message.message_thread_id }
      : {}),
  })

  if (!result.ok || !result.result) {
    console.error('Failed to send poll', result.description)
    await sendMessage(env.TELEGRAM_BOT_TOKEN, {
      chat_id: message.chat.id,
      text: `Could not create poll: ${result.description ?? 'unknown error'}`,
      reply_to_message_id: message.message_id,
      ...(typeof message.message_thread_id === 'number'
        ? { message_thread_id: message.message_thread_id }
        : {}),
    })
    return
  }

  // Bots do not receive their own messages via webhook — store from the API response
  await storeGroupMessage(env, result.result as TelegramMessage, {
    countStats: false,
    skipStats: true,
  })
}

function senderLabel(user?: TelegramUser): string {
  if (!user) return 'someone'
  const name = [user.first_name, user.last_name].filter(Boolean).join(' ')
  if (user.username) return `${name || user.username} (@${user.username})`
  return name || String(user.id)
}

/** Remove a group message (and its poll rows) from our DB — e.g. after deleting it in Telegram. */
async function removeStoredGroupMessage(
  env: CloudflareBindings,
  chatId: string,
  telegramMessageId: number | string,
): Promise<void> {
  const messageDbId = `${chatId}:${telegramMessageId}`
  const tgMsgId = String(telegramMessageId)

  const pollRows = await env.TELEGRAM_MESSAGES_DB.prepare(
    `SELECT poll_id FROM polls
     WHERE message_db_id = ?
        OR (chat_id = ? AND telegram_message_id = ?)`,
  )
    .bind(messageDbId, chatId, tgMsgId)
    .all<{ poll_id: string }>()

  const pollIds = (pollRows.results ?? []).map((r) => r.poll_id)
  if (pollIds.length > 0) {
    const placeholders = pollIds.map(() => '?').join(',')
    await env.TELEGRAM_MESSAGES_DB.prepare(
      `DELETE FROM poll_votes WHERE poll_id IN (${placeholders})`,
    )
      .bind(...pollIds)
      .run()
    await env.TELEGRAM_MESSAGES_DB.prepare(
      `DELETE FROM polls WHERE poll_id IN (${placeholders})`,
    )
      .bind(...pollIds)
      .run()
  }

  await env.TELEGRAM_MESSAGES_DB.prepare(
    `DELETE FROM all_messages_groups WHERE id = ?`,
  )
    .bind(messageDbId)
    .run()
}

/**
 * Delete a user-sent poll and re-send it as a bot poll (public) so poll_answer works.
 * Returns true if the original was deleted and a bot poll was sent (or delete succeeded
 * and we should not store the original).
 */
async function reclaimUserPollAsBotPoll(
  env: CloudflareBindings,
  message: TelegramMessage,
): Promise<'reclaimed' | 'failed_keep' | 'skipped'> {
  if (!message.poll || !env.TELEGRAM_BOT_TOKEN) return 'skipped'
  if (!message.from || message.from.is_bot) return 'skipped'
  if (!(await isPollViaBotEnabled(env))) return 'skipped'

  const poll = message.poll
  const options = poll.options.map((o) => o.text).filter(Boolean)
  if (options.length < 2) return 'skipped'

  const chatId = String(message.chat.id)

  const del = await deleteMessage(
    env.TELEGRAM_BOT_TOKEN,
    message.chat.id,
    message.message_id,
  )

  if (!del.ok) {
    const alreadyGone = /message to delete not found/i.test(del.description ?? '')
    if (alreadyGone) {
      // Likely a webhook retry after we already deleted + reposted — don't re-store the ghost poll
      await removeStoredGroupMessage(env, chatId, message.message_id)
      return 'reclaimed'
    }

    await sendMessage(env.TELEGRAM_BOT_TOKEN, {
      chat_id: message.chat.id,
      text:
        'Poll via Bot is enabled, but I could not delete this poll. Make me a group admin with <b>Delete messages</b> permission.',
      parse_mode: 'HTML',
      reply_to_message_id: message.message_id,
      ...(typeof message.message_thread_id === 'number'
        ? { message_thread_id: message.message_thread_id }
        : {}),
    })
    return 'failed_keep'
  }

  // Drop any DB copy of the deleted user poll (bots don't get delete events)
  await removeStoredGroupMessage(env, chatId, message.message_id)

  const sent = await sendPoll(env.TELEGRAM_BOT_TOKEN, {
    chat_id: message.chat.id,
    question: poll.question,
    options,
    // Always public so we receive poll_answer and can export voters
    is_anonymous: false,
    allows_multiple_answers: poll.allows_multiple_answers,
    ...(typeof message.message_thread_id === 'number'
      ? { message_thread_id: message.message_thread_id }
      : {}),
  })

  if (!sent.ok || !sent.result) {
    console.error('Failed to repost poll via bot', sent.description)
    await sendMessage(env.TELEGRAM_BOT_TOKEN, {
      chat_id: message.chat.id,
      text: `Deleted the poll from ${senderLabel(message.from)} but failed to repost it: ${sent.description ?? 'unknown error'}`,
      ...(typeof message.message_thread_id === 'number'
        ? { message_thread_id: message.message_thread_id }
        : {}),
    })
    return 'reclaimed'
  }

  // Bots do not receive their own messages via webhook — store from the API response
  await storeGroupMessage(env, sent.result as TelegramMessage, {
    countStats: false,
    skipStats: true,
  })

  const note = await sendMessage(env.TELEGRAM_BOT_TOKEN, {
    chat_id: message.chat.id,
    text: `Poll from ${senderLabel(message.from)} was reposted by the bot so votes can be tracked.`,
    ...(typeof message.message_thread_id === 'number'
      ? { message_thread_id: message.message_thread_id }
      : {}),
    reply_to_message_id: sent.result.message_id,
  })

  if (note.ok && note.result) {
    await storeGroupMessage(env, note.result as TelegramMessage, {
      countStats: false,
      skipStats: true,
    })
  }

  return 'reclaimed'
}

async function storeGroupMessage(
  env: CloudflareBindings,
  message: TelegramMessage,
  opts: { countStats: boolean; skipStats?: boolean },
): Promise<void> {
  const chat = message.chat
  const chatId = String(chat.id)
  const fromId = message.from ? String(message.from.id) : '0'

  if (message.from && !message.from.is_bot) {
    await upsertMember(env.MAIN_DB, message.from)
    await upsertGroupMember(env.MAIN_DB, chatId, fromId)
  }

  const id = `${chatId}:${message.message_id}`
  const existing = opts.countStats
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
       message_text = excluded.message_text,
       message_thread_id = COALESCE(excluded.message_thread_id, all_messages_groups.message_thread_id)`,
  )
    .bind(
      id,
      JSON.stringify(message),
      message.text ?? message.caption ?? message.poll?.question ?? null,
      chatId,
      fromId,
      resolveThreadId(message),
    )
    .run()

  if (message.poll) {
    await upsertPoll(env.TELEGRAM_MESSAGES_DB, message.poll, {
      chatId,
      messageDbId: id,
      telegramMessageId: String(message.message_id),
    })
  }

  const isServiceTopicEvent = Boolean(
    message.forum_topic_created ||
      message.forum_topic_edited ||
      message.forum_topic_closed ||
      message.forum_topic_reopened ||
      message.general_forum_topic_hidden ||
      message.general_forum_topic_unhidden,
  )

  if (
    opts.countStats &&
    !opts.skipStats &&
    !existing &&
    !isServiceTopicEvent &&
    message.from &&
    !message.from.is_bot
  ) {
    await incrementStats(env.MAIN_DB, chatId, fromId, {
      messages: 1,
      replies: message.reply_to_message ? 1 : 0,
    })
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
  const shouldCreatePoll =
    countStats && message.from && !message.from.is_bot && isPollCommand(message.text)

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
    if (shouldCreatePoll) {
      await handlePollCommand(env, message)
    }
    return
  }

  if (!isGroupChat(chat.type)) return

  await upsertGroup(env.MAIN_DB, chat, true)
  await syncTopicFromMessage(env, message)

  // Always store polls (including ones sent by this bot) so votes can be linked
  if (message.poll) {
    if (countStats && message.from && !message.from.is_bot) {
      const reclaim = await reclaimUserPollAsBotPoll(env, message)
      if (reclaim === 'reclaimed') {
        // Original deleted; bot poll arrives as a separate update
        if (message.from) {
          await upsertMember(env.MAIN_DB, message.from)
          await upsertGroupMember(env.MAIN_DB, chatId, String(message.from.id))
        }
        return
      }
      // failed_keep or skipped → store the user poll as usual
    }
    await storeGroupMessage(env, message, { countStats, skipStats: true })
    return
  }

  if (!message.from) return

  // Service / other bot messages without polls: ignore content storage
  if (message.from.is_bot) return

  if (shouldCreatePoll) {
    await storeGroupMessage(env, message, { countStats })
    await handlePollCommand(env, message)
    return
  }

  await storeGroupMessage(env, message, { countStats })

  if (shouldReplyInfo) {
    await replyWithInfo(env, message)
  }
}

async function handlePollUpdate(env: CloudflareBindings, poll: TelegramPoll): Promise<void> {
  const existing = await env.TELEGRAM_MESSAGES_DB.prepare(
    `SELECT chat_id, message_db_id, telegram_message_id FROM polls WHERE poll_id = ?`,
  )
    .bind(poll.id)
    .first<{
      chat_id: string
      message_db_id: string | null
      telegram_message_id: string | null
    }>()

  await upsertPoll(env.TELEGRAM_MESSAGES_DB, poll, {
    chatId: existing?.chat_id ?? 'unknown',
    messageDbId: existing?.message_db_id,
    telegramMessageId: existing?.telegram_message_id,
  })
  await applyPollUpdateToMessage(env.TELEGRAM_MESSAGES_DB, poll)
}

async function handlePollAnswer(
  env: CloudflareBindings,
  answer: TelegramPollAnswer,
): Promise<void> {
  if (answer.user.is_bot) return
  await upsertMember(env.MAIN_DB, answer.user)

  const pollRow = await env.TELEGRAM_MESSAGES_DB.prepare(
    `SELECT chat_id FROM polls WHERE poll_id = ?`,
  )
    .bind(answer.poll_id)
    .first<{ chat_id: string }>()

  if (pollRow?.chat_id && pollRow.chat_id !== 'unknown') {
    await upsertGroupMember(env.MAIN_DB, pollRow.chat_id, String(answer.user.id))
  }

  await upsertPollVote(
    env.TELEGRAM_MESSAGES_DB,
    answer.poll_id,
    answer.user,
    answer.option_ids,
    JSON.stringify(answer),
  )
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
  if (update.poll) {
    await handlePollUpdate(env, update.poll)
  }
  if (update.poll_answer) {
    await handlePollAnswer(env, update.poll_answer)
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
