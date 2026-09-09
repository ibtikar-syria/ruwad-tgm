import { Hono } from 'hono'
import type {
  CloudflareBindings,
  AppVariables,
  GroupMessageRow,
  GroupRow,
  MemberRow,
  SettingRow,
  TopicRow,
} from '../types'
import {
  ALLOWED_UPDATES,
  deleteMessage,
  deleteWebhook,
  forwardMessage,
  getWebhookInfo,
  sendMessage,
  setWebhook,
} from '../telegram/api'
import { ensureGeneralTopic, upsertTopic } from '../db/members'
import { storePrivateMessage } from '../db/privateMessages'
import { applyPollUpdateToMessage, upsertPoll } from '../db/polls'
import { mergeHashtagCounts, parseHashtagCounts } from '../telegram/hashtags'
import { extractTopicTitleFromJson } from '../telegram/topicTitle'
import type { TelegramMessage, TelegramPoll } from '../telegram/types'

export const apiRoutes = new Hono<{ Bindings: CloudflareBindings; Variables: AppVariables }>()

apiRoutes.get('/groups', async (c) => {
  // Backfill topics from stored messages so forum threads aren't a flat message dump
  const threads = await c.env.TELEGRAM_MESSAGES_DB.prepare(
    `SELECT DISTINCT chat_id, message_thread_id
     FROM all_messages_groups
     WHERE message_thread_id IS NOT NULL AND message_thread_id != ''`,
  ).all<{ chat_id: string; message_thread_id: string }>()

  // Oldest first so a later forum_topic_edited overwrites the creation name
  const titleRows = await c.env.TELEGRAM_MESSAGES_DB.prepare(
    `SELECT chat_id, message_thread_id, message_json
     FROM all_messages_groups
     WHERE message_json LIKE '%forum_topic_created%'
        OR message_json LIKE '%forum_topic_edited%'
     ORDER BY created_at ASC`,
  ).all<{ chat_id: string; message_thread_id: string; message_json: string }>()

  const titleByKey = new Map<string, string>()
  for (const row of titleRows.results ?? []) {
    if (!row.message_thread_id) continue
    const name = extractTopicTitleFromJson(row.message_json)
    if (name) {
      titleByKey.set(`${row.chat_id}:${row.message_thread_id}`, name)
    }
  }

  for (const row of threads.results ?? []) {
    await upsertTopic(c.env.MAIN_DB, row.chat_id, row.message_thread_id, {
      title: titleByKey.get(`${row.chat_id}:${row.message_thread_id}`) ?? null,
      isGeneral: row.message_thread_id === '1',
      markForum: true,
    })
  }

  // Forum groups always include the General (main) topic, even with no messages yet
  const forumGroups = await c.env.MAIN_DB.prepare(
    `SELECT chat_id FROM groups WHERE is_forum = 1`,
  ).all<{ chat_id: string }>()
  for (const g of forumGroups.results ?? []) {
    await ensureGeneralTopic(c.env.MAIN_DB, g.chat_id)
  }

  // Also treat any chat that already has topics as a forum and ensure General
  const chatsWithTopics = await c.env.MAIN_DB.prepare(
    `SELECT DISTINCT chat_id FROM topics`,
  ).all<{ chat_id: string }>()
  for (const g of chatsWithTopics.results ?? []) {
    await ensureGeneralTopic(c.env.MAIN_DB, g.chat_id)
  }

  const rows = await c.env.MAIN_DB.prepare(
    `SELECT chat_id, title, username, is_forum, is_active, added_at, updated_at
     FROM groups
     ORDER BY updated_at DESC`,
  ).all<GroupRow>()

  const topicRows = await c.env.MAIN_DB.prepare(
    `SELECT chat_id, message_thread_id, title, custom_title, is_general, is_active,
            first_seen_at, updated_at
     FROM topics
     WHERE is_active = 1
     ORDER BY is_general DESC, COALESCE(custom_title, title) COLLATE NOCASE ASC,
              message_thread_id ASC`,
  ).all<TopicRow>()

  const topicsByChat = new Map<string, TopicRow[]>()
  for (const topic of topicRows.results ?? []) {
    const list = topicsByChat.get(topic.chat_id) ?? []
    list.push(topic)
    topicsByChat.set(topic.chat_id, list)
  }

  return c.json({
    groups: (rows.results ?? []).map((g) => ({
      ...g,
      is_forum: g.is_forum ? 1 : 0,
      topics: topicsByChat.get(g.chat_id) ?? [],
    })),
  })
})

apiRoutes.get('/groups/:chatId/messages', async (c) => {
  const chatId = c.req.param('chatId')
  const limit = Math.min(Number(c.req.query('limit') ?? 50), 200)
  const before = c.req.query('before')
  const threadId = c.req.query('thread_id')

  let query: D1PreparedStatement
  if (threadId != null && threadId !== '') {
    // General topic (1): also include legacy rows with NULL thread id
    const threadClause =
      threadId === '1'
        ? `(message_thread_id = ? OR message_thread_id IS NULL)`
        : `message_thread_id = ?`

    if (before) {
      query = c.env.TELEGRAM_MESSAGES_DB.prepare(
        `SELECT id, message_json, message_text, chat_id, user_id, message_thread_id, notes, created_at
         FROM all_messages_groups
         WHERE chat_id = ? AND ${threadClause} AND created_at < ?
         ORDER BY created_at DESC
         LIMIT ?`,
      ).bind(chatId, threadId, before, limit)
    } else {
      query = c.env.TELEGRAM_MESSAGES_DB.prepare(
        `SELECT id, message_json, message_text, chat_id, user_id, message_thread_id, notes, created_at
         FROM all_messages_groups
         WHERE chat_id = ? AND ${threadClause}
         ORDER BY created_at DESC
         LIMIT ?`,
      ).bind(chatId, threadId, limit)
    }
  } else if (before) {
    query = c.env.TELEGRAM_MESSAGES_DB.prepare(
      `SELECT id, message_json, message_text, chat_id, user_id, message_thread_id, notes, created_at
       FROM all_messages_groups
       WHERE chat_id = ? AND created_at < ?
       ORDER BY created_at DESC
       LIMIT ?`,
    ).bind(chatId, before, limit)
  } else {
    query = c.env.TELEGRAM_MESSAGES_DB.prepare(
      `SELECT id, message_json, message_text, chat_id, user_id, message_thread_id, notes, created_at
       FROM all_messages_groups
       WHERE chat_id = ?
       ORDER BY created_at DESC
       LIMIT ?`,
    ).bind(chatId, limit)
  }

  const rows = await query.all<GroupMessageRow>()
  const messages = (rows.results ?? []).reverse()

  const userIds = [...new Set(messages.map((m) => m.user_id))]
  const membersById: Record<string, MemberRow> = {}
  if (userIds.length > 0) {
    const placeholders = userIds.map(() => '?').join(',')
    const members = await c.env.MAIN_DB.prepare(
      `SELECT * FROM members WHERE telegram_user_id IN (${placeholders})`,
    )
      .bind(...userIds)
      .all<MemberRow>()
    for (const m of members.results ?? []) {
      membersById[m.telegram_user_id] = m
    }
  }

  const messageIds = messages.map((m) => m.id)
  const pollsByMessage = new Map<
    string,
    {
      poll_id: string
      poll_json: string
      is_anonymous: number
    }
  >()
  if (messageIds.length > 0) {
    const placeholders = messageIds.map(() => '?').join(',')
    const pollRows = await c.env.TELEGRAM_MESSAGES_DB.prepare(
      `SELECT poll_id, message_db_id, poll_json, is_anonymous
       FROM polls
       WHERE message_db_id IN (${placeholders})`,
    )
      .bind(...messageIds)
      .all<{
        poll_id: string
        message_db_id: string
        poll_json: string
        is_anonymous: number
      }>()
    for (const p of pollRows.results ?? []) {
      pollsByMessage.set(p.message_db_id, p)
    }
  }

  // Backfill polls from message_json when not yet in polls table
  for (const m of messages) {
    if (pollsByMessage.has(m.id)) continue
    try {
      const parsed = JSON.parse(m.message_json) as { poll?: TelegramPoll }
      if (!parsed.poll?.id) continue
      await upsertPoll(c.env.TELEGRAM_MESSAGES_DB, parsed.poll, {
        chatId: m.chat_id,
        messageDbId: m.id,
        telegramMessageId: m.id.split(':').pop() ?? null,
      })
      pollsByMessage.set(m.id, {
        poll_id: parsed.poll.id,
        poll_json: JSON.stringify(parsed.poll),
        is_anonymous: parsed.poll.is_anonymous ? 1 : 0,
      })
    } catch {
      /* ignore */
    }
  }

  const pollIds = [...new Set([...pollsByMessage.values()].map((p) => p.poll_id))]
  const votesByPoll = new Map<
    string,
    {
      user_id: string
      option_ids: number[]
      display_name: string
      username: string | null
      membership_id: string | null
    }[]
  >()

  if (pollIds.length > 0) {
    const placeholders = pollIds.map(() => '?').join(',')
    const voteRows = await c.env.TELEGRAM_MESSAGES_DB.prepare(
      `SELECT poll_id, user_id, option_ids FROM poll_votes WHERE poll_id IN (${placeholders})`,
    )
      .bind(...pollIds)
      .all<{ poll_id: string; user_id: string; option_ids: string }>()

    const voteUserIds = [...new Set((voteRows.results ?? []).map((v) => v.user_id))]
    if (voteUserIds.length > 0) {
      const mPlaceholders = voteUserIds.map(() => '?').join(',')
      const voteMembers = await c.env.MAIN_DB.prepare(
        `SELECT * FROM members WHERE telegram_user_id IN (${mPlaceholders})`,
      )
        .bind(...voteUserIds)
        .all<MemberRow>()
      for (const m of voteMembers.results ?? []) {
        membersById[m.telegram_user_id] = m
      }
    }

    for (const v of voteRows.results ?? []) {
      let optionIds: number[] = []
      try {
        optionIds = JSON.parse(v.option_ids) as number[]
      } catch {
        optionIds = []
      }
      const member = membersById[v.user_id]
      const list = votesByPoll.get(v.poll_id) ?? []
      list.push({
        user_id: v.user_id,
        option_ids: optionIds,
        display_name: member?.display_name ?? v.user_id,
        username: member?.username ?? null,
        membership_id: member?.membership_id ?? null,
      })
      votesByPoll.set(v.poll_id, list)
    }
  }

  return c.json({
    messages: messages.map((m) => {
      let replyTo: { message_id?: number; text?: string } | null = null
      let pollFromJson: TelegramPoll | null = null
      try {
        const parsed = JSON.parse(m.message_json) as {
          reply_to_message?: { message_id?: number; text?: string; caption?: string }
          poll?: TelegramPoll
        }
        if (parsed.reply_to_message) {
          replyTo = {
            message_id: parsed.reply_to_message.message_id,
            text: parsed.reply_to_message.text ?? parsed.reply_to_message.caption,
          }
        }
        if (parsed.poll) pollFromJson = parsed.poll
      } catch {
        /* ignore */
      }

      const stored = pollsByMessage.get(m.id)
      let poll: TelegramPoll | null = pollFromJson
      if (stored) {
        try {
          poll = JSON.parse(stored.poll_json) as TelegramPoll
        } catch {
          /* keep pollFromJson */
        }
      }

      const member = membersById[m.user_id]
      return {
        id: m.id,
        chat_id: m.chat_id,
        user_id: m.user_id,
        text: m.message_text,
        created_at: m.created_at,
        message_thread_id: m.message_thread_id,
        display_name: member?.display_name ?? m.user_id,
        username: member?.username ?? null,
        membership_id: member?.membership_id ?? null,
        reply_to: replyTo,
        message_json: m.message_json,
        poll: poll
          ? {
              id: poll.id,
              question: poll.question,
              options: poll.options,
              total_voter_count: poll.total_voter_count,
              is_closed: poll.is_closed,
              is_anonymous: poll.is_anonymous,
              allows_multiple_answers: poll.allows_multiple_answers,
              type: poll.type,
              votes: poll.is_anonymous ? [] : (votesByPoll.get(poll.id) ?? []),
            }
          : null,
      }
    }),
  })
})

apiRoutes.get('/private-chats', async (c) => {
  const rows = await c.env.TELEGRAM_MESSAGES_DB.prepare(
    `SELECT
       chat_id,
       MAX(created_at) AS last_message_at,
       COUNT(*) AS message_count
     FROM all_messages_private
     WHERE chat_id IS NOT NULL AND chat_id != ''
     GROUP BY chat_id
     ORDER BY last_message_at DESC`,
  ).all<{ chat_id: string; last_message_at: string; message_count: number }>()

  const chats = rows.results ?? []
  if (chats.length === 0) {
    return c.json({ chats: [] })
  }

  const chatIds = chats.map((r) => r.chat_id)
  const placeholders = chatIds.map(() => '?').join(',')

  const previewRows = await c.env.TELEGRAM_MESSAGES_DB.prepare(
    `SELECT p.chat_id, p.message_text
     FROM all_messages_private p
     INNER JOIN (
       SELECT chat_id, MAX(created_at) AS last_at
       FROM all_messages_private
       WHERE chat_id IN (${placeholders})
       GROUP BY chat_id
     ) latest
       ON latest.chat_id = p.chat_id AND latest.last_at = p.created_at`,
  )
    .bind(...chatIds)
    .all<{ chat_id: string; message_text: string | null }>()

  const previewByChat = new Map<string, string | null>()
  for (const row of previewRows.results ?? []) {
    previewByChat.set(row.chat_id, row.message_text)
  }

  const members = await c.env.MAIN_DB.prepare(
    `SELECT * FROM members WHERE telegram_user_id IN (${placeholders})`,
  )
    .bind(...chatIds)
    .all<MemberRow>()

  const membersById: Record<string, MemberRow> = {}
  for (const m of members.results ?? []) {
    membersById[m.telegram_user_id] = m
  }

  return c.json({
    chats: chats.map((row) => {
      const member = membersById[row.chat_id]
      return {
        chat_id: row.chat_id,
        last_message_at: row.last_message_at,
        message_count: row.message_count,
        last_message_text: previewByChat.get(row.chat_id) ?? null,
        display_name: member?.custom_name || member?.display_name || row.chat_id,
        custom_name: member?.custom_name ?? null,
        username: member?.username ?? null,
        membership_id: member?.membership_id ?? null,
      }
    }),
  })
})

apiRoutes.get('/private-chats/:chatId/messages', async (c) => {
  const chatId = c.req.param('chatId')
  const limit = Math.min(Number(c.req.query('limit') ?? 100), 200)
  const before = c.req.query('before')

  const query = before
    ? c.env.TELEGRAM_MESSAGES_DB.prepare(
        `SELECT id, message_json, message_text, chat_id, notes, created_at
         FROM all_messages_private
         WHERE chat_id = ? AND created_at < ?
         ORDER BY created_at DESC
         LIMIT ?`,
      ).bind(chatId, before, limit)
    : c.env.TELEGRAM_MESSAGES_DB.prepare(
        `SELECT id, message_json, message_text, chat_id, notes, created_at
         FROM all_messages_private
         WHERE chat_id = ?
         ORDER BY created_at DESC
         LIMIT ?`,
      ).bind(chatId, limit)

  const rows = await query.all<{
    id: string
    message_json: string
    message_text: string | null
    chat_id: string | null
    notes: string | null
    created_at: string
  }>()

  const member = await c.env.MAIN_DB.prepare(
    `SELECT * FROM members WHERE telegram_user_id = ?`,
  )
    .bind(chatId)
    .first<MemberRow>()

  const messages = (rows.results ?? [])
    .slice()
    .reverse()
    .map((m) => {
      let fromBot = false
      let fromId: string | null = null
      let replyTo: { message_id?: number; text?: string } | null = null
      try {
        const parsed = JSON.parse(m.message_json) as {
          from?: { id?: number; is_bot?: boolean; first_name?: string }
          reply_to_message?: { message_id?: number; text?: string; caption?: string }
        }
        fromBot = Boolean(parsed.from?.is_bot)
        fromId = parsed.from?.id != null ? String(parsed.from.id) : null
        if (parsed.reply_to_message) {
          replyTo = {
            message_id: parsed.reply_to_message.message_id,
            text: parsed.reply_to_message.text ?? parsed.reply_to_message.caption,
          }
        }
      } catch {
        /* ignore */
      }

      return {
        id: m.id,
        chat_id: m.chat_id ?? chatId,
        user_id: fromId ?? chatId,
        text: m.message_text,
        created_at: m.created_at,
        from_bot: fromBot,
        display_name: fromBot
          ? 'Bot'
          : member?.custom_name || member?.display_name || chatId,
        username: fromBot ? null : (member?.username ?? null),
        membership_id: fromBot ? null : (member?.membership_id ?? null),
        custom_name: fromBot ? null : (member?.custom_name ?? null),
        reply_to: replyTo,
        message_json: m.message_json,
      }
    })

  return c.json({
    chat_id: chatId,
    member: member
      ? {
          telegram_user_id: member.telegram_user_id,
          display_name: member.display_name,
          custom_name: member.custom_name,
          username: member.username,
          membership_id: member.membership_id,
        }
      : null,
    messages,
  })
})

apiRoutes.post('/private-chats/:chatId/messages', async (c) => {
  const chatId = c.req.param('chatId')
  if (!c.env.TELEGRAM_BOT_TOKEN) {
    return c.json({ error: 'TELEGRAM_BOT_TOKEN is not configured' }, 500)
  }

  let body: { text?: string }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON' }, 400)
  }

  const text = typeof body.text === 'string' ? body.text.trim() : ''
  if (!text) {
    return c.json({ error: 'text is required' }, 400)
  }
  if (text.length > 4096) {
    return c.json({ error: 'text must be 4096 characters or fewer' }, 400)
  }

  const sent = await sendMessage(c.env.TELEGRAM_BOT_TOKEN, {
    chat_id: chatId,
    text,
  })

  if (!sent.ok || !sent.result) {
    return c.json(
      { error: sent.description ?? 'Failed to send message via Telegram' },
      502,
    )
  }

  const message = sent.result as TelegramMessage
  await storePrivateMessage(c.env.TELEGRAM_MESSAGES_DB, message)

  return c.json({
    ok: true,
    message: {
      id: `${chatId}:${message.message_id}`,
      chat_id: chatId,
      user_id: message.from ? String(message.from.id) : 'bot',
      text: message.text ?? text,
      created_at: new Date((message.date ?? Math.floor(Date.now() / 1000)) * 1000).toISOString(),
      from_bot: true,
      display_name: 'Bot',
      username: null,
      membership_id: null,
      custom_name: null,
      reply_to: null,
      message_json: JSON.stringify(message),
    },
  })
})

apiRoutes.get('/groups/:chatId/members', async (c) => {
  const chatId = c.req.param('chatId')
  const rows = await c.env.MAIN_DB.prepare(
    `SELECT
       m.id,
       m.telegram_user_id,
       m.membership_id,
       m.custom_name,
       m.display_name,
       m.username,
       m.first_seen_at,
       m.updated_at,
       gm.joined_at,
       gm.is_active AS in_group,
       COALESCE(s.messages_count, 0) AS messages_count,
       COALESCE(s.replies_count, 0) AS replies_count,
       COALESCE(s.reactions_count, 0) AS reactions_count
     FROM group_members gm
     JOIN members m ON m.telegram_user_id = gm.telegram_user_id
     LEFT JOIN member_stats s
       ON s.chat_id = gm.chat_id AND s.telegram_user_id = gm.telegram_user_id
     WHERE gm.chat_id = ?
     ORDER BY m.display_name COLLATE NOCASE ASC`,
  )
    .bind(chatId)
    .all()

  return c.json({ members: rows.results ?? [] })
})

apiRoutes.get('/polls/:pollId', async (c) => {
  const pollId = c.req.param('pollId')
  const pollRow = await c.env.TELEGRAM_MESSAGES_DB.prepare(
    `SELECT poll_id, chat_id, question, poll_json, total_voter_count, is_closed, is_anonymous, allows_multiple_answers
     FROM polls WHERE poll_id = ?`,
  )
    .bind(pollId)
    .first<{
      poll_id: string
      chat_id: string
      question: string | null
      poll_json: string
      total_voter_count: number
      is_closed: number
      is_anonymous: number
      allows_multiple_answers: number
    }>()

  if (!pollRow) {
    return c.json({ error: 'Poll not found' }, 404)
  }

  let poll: TelegramPoll
  try {
    poll = JSON.parse(pollRow.poll_json) as TelegramPoll
  } catch {
    return c.json({ error: 'Corrupt poll data' }, 500)
  }

  const voteRows = await c.env.TELEGRAM_MESSAGES_DB.prepare(
    `SELECT user_id, option_ids, updated_at FROM poll_votes WHERE poll_id = ? ORDER BY updated_at ASC`,
  )
    .bind(pollId)
    .all<{ user_id: string; option_ids: string; updated_at: string }>()

  const userIds = [...new Set((voteRows.results ?? []).map((v) => v.user_id))]
  const membersById: Record<string, MemberRow> = {}
  if (userIds.length > 0) {
    const placeholders = userIds.map(() => '?').join(',')
    const members = await c.env.MAIN_DB.prepare(
      `SELECT * FROM members WHERE telegram_user_id IN (${placeholders})`,
    )
      .bind(...userIds)
      .all<MemberRow>()
    for (const m of members.results ?? []) {
      membersById[m.telegram_user_id] = m
    }
  }

  const votes = (voteRows.results ?? []).map((v) => {
    let optionIds: number[] = []
    try {
      optionIds = JSON.parse(v.option_ids) as number[]
    } catch {
      optionIds = []
    }
    const member = membersById[v.user_id]
    return {
      user_id: v.user_id,
      option_ids: optionIds,
      option_texts: optionIds.map((i) => poll.options[i]?.text ?? `Option ${i}`),
      display_name: member?.display_name ?? v.user_id,
      username: member?.username ?? null,
      membership_id: member?.membership_id ?? null,
      updated_at: v.updated_at,
    }
  })

  return c.json({
    poll: {
      id: poll.id,
      question: poll.question,
      options: poll.options,
      total_voter_count: poll.total_voter_count,
      is_closed: poll.is_closed,
      is_anonymous: poll.is_anonymous,
      allows_multiple_answers: poll.allows_multiple_answers,
      type: poll.type,
      votes,
    },
  })
})

/**
 * Refresh poll totals from Telegram via forwardMessage (Bot API has no getMessage).
 * Forwards silently to the same chat, reads the poll from the response, then deletes the forward.
 */
apiRoutes.post('/polls/:pollId/refresh', async (c) => {
  const pollId = c.req.param('pollId')
  if (!c.env.TELEGRAM_BOT_TOKEN) {
    return c.json({ error: 'TELEGRAM_BOT_TOKEN is not configured' }, 500)
  }

  const pollRow = await c.env.TELEGRAM_MESSAGES_DB.prepare(
    `SELECT poll_id, chat_id, message_db_id, telegram_message_id, poll_json
     FROM polls WHERE poll_id = ?`,
  )
    .bind(pollId)
    .first<{
      poll_id: string
      chat_id: string
      message_db_id: string | null
      telegram_message_id: string | null
      poll_json: string
    }>()

  if (!pollRow) {
    return c.json({ error: 'Poll not found' }, 404)
  }
  if (!pollRow.telegram_message_id) {
    return c.json({ error: 'Poll is not linked to a Telegram message' }, 400)
  }

  let threadId: number | undefined
  if (pollRow.message_db_id) {
    const msg = await c.env.TELEGRAM_MESSAGES_DB.prepare(
      `SELECT message_thread_id FROM all_messages_groups WHERE id = ?`,
    )
      .bind(pollRow.message_db_id)
      .first<{ message_thread_id: string | null }>()
    if (msg?.message_thread_id) {
      const n = Number(msg.message_thread_id)
      if (Number.isFinite(n)) threadId = n
    }
  }

  const forwarded = await forwardMessage(c.env.TELEGRAM_BOT_TOKEN, {
    chat_id: pollRow.chat_id,
    from_chat_id: pollRow.chat_id,
    message_id: Number(pollRow.telegram_message_id),
    message_thread_id: threadId,
    disable_notification: true,
  })

  if (!forwarded.ok || !forwarded.result) {
    return c.json(
      {
        error:
          forwarded.description ??
          'Could not refresh poll from Telegram (bot may lack permission to forward)',
      },
      502,
    )
  }

  const freshPoll = forwarded.result.poll
  if (!freshPoll) {
    // Clean up even if unexpected
    await deleteMessage(
      c.env.TELEGRAM_BOT_TOKEN,
      pollRow.chat_id,
      forwarded.result.message_id,
    )
    return c.json({ error: 'Forwarded message did not include poll data' }, 502)
  }

  await upsertPoll(c.env.TELEGRAM_MESSAGES_DB, freshPoll, {
    chatId: pollRow.chat_id,
    messageDbId: pollRow.message_db_id,
    telegramMessageId: pollRow.telegram_message_id,
  })
  await applyPollUpdateToMessage(c.env.TELEGRAM_MESSAGES_DB, freshPoll)

  // Best-effort cleanup of the temporary forward
  await deleteMessage(
    c.env.TELEGRAM_BOT_TOKEN,
    pollRow.chat_id,
    forwarded.result.message_id,
  )

  // Reuse GET shape
  const voteRows = await c.env.TELEGRAM_MESSAGES_DB.prepare(
    `SELECT user_id, option_ids, updated_at FROM poll_votes WHERE poll_id = ? ORDER BY updated_at ASC`,
  )
    .bind(pollId)
    .all<{ user_id: string; option_ids: string; updated_at: string }>()

  const userIds = [...new Set((voteRows.results ?? []).map((v) => v.user_id))]
  const membersById: Record<string, MemberRow> = {}
  if (userIds.length > 0) {
    const placeholders = userIds.map(() => '?').join(',')
    const members = await c.env.MAIN_DB.prepare(
      `SELECT * FROM members WHERE telegram_user_id IN (${placeholders})`,
    )
      .bind(...userIds)
      .all<MemberRow>()
    for (const m of members.results ?? []) {
      membersById[m.telegram_user_id] = m
    }
  }

  const votes = (voteRows.results ?? []).map((v) => {
    let optionIds: number[] = []
    try {
      optionIds = JSON.parse(v.option_ids) as number[]
    } catch {
      optionIds = []
    }
    const member = membersById[v.user_id]
    return {
      user_id: v.user_id,
      option_ids: optionIds,
      option_texts: optionIds.map((i) => freshPoll.options[i]?.text ?? `Option ${i}`),
      display_name: member?.display_name ?? v.user_id,
      username: member?.username ?? null,
      membership_id: member?.membership_id ?? null,
      updated_at: v.updated_at,
    }
  })

  return c.json({
    ok: true,
    poll: {
      id: freshPoll.id,
      question: freshPoll.question,
      options: freshPoll.options,
      total_voter_count: freshPoll.total_voter_count,
      is_closed: freshPoll.is_closed,
      is_anonymous: freshPoll.is_anonymous,
      allows_multiple_answers: freshPoll.allows_multiple_answers,
      type: freshPoll.type,
      votes,
    },
  })
})

apiRoutes.patch('/members/:telegramUserId', async (c) => {
  const telegramUserId = c.req.param('telegramUserId')
  let body: { membership_id?: string | null; custom_name?: string | null }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON' }, 400)
  }

  const hasMembershipId = 'membership_id' in body
  const hasCustomName = 'custom_name' in body
  if (!hasMembershipId && !hasCustomName) {
    return c.json({ error: 'membership_id or custom_name is required' }, 400)
  }

  const normalize = (value: string | null | undefined): string | null => {
    if (value === null || value === undefined) return null
    const trimmed = String(value).trim()
    return trimmed === '' ? null : trimmed
  }

  const assignments: string[] = []
  const values: (string | null)[] = []
  if (hasMembershipId) {
    assignments.push('membership_id = ?')
    values.push(normalize(body.membership_id))
  }
  if (hasCustomName) {
    assignments.push('custom_name = ?')
    values.push(normalize(body.custom_name))
  }

  const now = new Date().toISOString()
  const result = await c.env.MAIN_DB.prepare(
    `UPDATE members SET ${assignments.join(', ')}, updated_at = ? WHERE telegram_user_id = ?`,
  )
    .bind(...values, now, telegramUserId)
    .run()

  if (!result.meta.changes) {
    return c.json({ error: 'Member not found' }, 404)
  }

  const member = await c.env.MAIN_DB.prepare(
    `SELECT * FROM members WHERE telegram_user_id = ?`,
  )
    .bind(telegramUserId)
    .first<MemberRow>()

  return c.json({ member })
})

/**
 * Renames a forum topic for display only. Telegram owns `title` and keeps
 * overwriting it during the backfill in GET /groups, so the admin's name lives
 * in `custom_title`. Sending null or an empty string reverts to Telegram's name.
 */
apiRoutes.patch('/groups/:chatId/topics/:threadId', async (c) => {
  const chatId = c.req.param('chatId')
  const threadId = c.req.param('threadId')

  let body: { custom_title?: string | null }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON' }, 400)
  }

  if (!('custom_title' in body)) {
    return c.json({ error: 'custom_title is required' }, 400)
  }

  const raw = body.custom_title == null ? '' : String(body.custom_title).trim()
  if (raw.length > 128) {
    return c.json({ error: 'custom_title must be 128 characters or fewer' }, 400)
  }
  const customTitle = raw === '' ? null : raw

  const now = new Date().toISOString()
  const result = await c.env.MAIN_DB.prepare(
    `UPDATE topics SET custom_title = ?, updated_at = ?
     WHERE chat_id = ? AND message_thread_id = ?`,
  )
    .bind(customTitle, now, chatId, threadId)
    .run()

  if (!result.meta.changes) {
    return c.json({ error: 'Topic not found' }, 404)
  }

  const topic = await c.env.MAIN_DB.prepare(
    `SELECT chat_id, message_thread_id, title, custom_title, is_general, is_active,
            first_seen_at, updated_at
     FROM topics
     WHERE chat_id = ? AND message_thread_id = ?`,
  )
    .bind(chatId, threadId)
    .first<TopicRow>()

  return c.json({ topic })
})

type MemberImportRow = {
  telegram_user_id?: string | null
  username?: string | null
  custom_name?: string | null
  membership_id?: string | null
}

const MEMBER_IMPORT_LIMIT = 5000

/**
 * Bulk import writes only custom_name and membership_id. telegram_user_id and
 * username are owned by Telegram and are used for matching only — a username in
 * the sheet can be stale, so a Telegram user ID always wins when both are given.
 */

apiRoutes.post('/members/import', async (c) => {
  let body: { rows?: MemberImportRow[] }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON' }, 400)
  }

  const rows = body.rows
  if (!Array.isArray(rows) || rows.length === 0) {
    return c.json({ error: 'rows must be a non-empty array' }, 400)
  }
  if (rows.length > MEMBER_IMPORT_LIMIT) {
    return c.json({ error: `Too many rows (max ${MEMBER_IMPORT_LIMIT})` }, 400)
  }

  const clean = (value: string | null | undefined): string | null => {
    if (value === null || value === undefined) return null
    const trimmed = String(value).trim()
    return trimmed === '' ? null : trimmed
  }

  const existing = await c.env.MAIN_DB.prepare(
    `SELECT telegram_user_id, username FROM members`,
  ).all<{ telegram_user_id: string; username: string | null }>()

  const knownIds = new Set<string>()
  const idByUsername = new Map<string, string>()
  for (const m of existing.results ?? []) {
    knownIds.add(m.telegram_user_id)
    if (m.username) idByUsername.set(m.username.toLowerCase(), m.telegram_user_id)
  }

  const now = new Date().toISOString()
  const statements: D1PreparedStatement[] = []
  const skipped: { row: number; reason: string }[] = []
  const seen = new Set<string>()
  let updated = 0
  let created = 0

  rows.forEach((raw, index) => {
    // Row 1 is the header in the source file, so data starts at 2
    const rowNumber = index + 2
    const telegramUserId = clean(raw.telegram_user_id)
    const username = clean(raw.username)?.replace(/^@/, '') ?? null
    const customName = clean(raw.custom_name)
    const membershipId = clean(raw.membership_id)

    // Telegram user ID takes priority; username is only a fallback lookup
    let targetId = telegramUserId
    if (!targetId && username) {
      targetId = idByUsername.get(username.toLowerCase()) ?? null
      if (!targetId) {
        skipped.push({ row: rowNumber, reason: `No member matches @${username}` })
        return
      }
    }

    if (!targetId) {
      skipped.push({ row: rowNumber, reason: 'Missing Telegram user ID and username' })
      return
    }
    if (!/^-?\d+$/.test(targetId)) {
      skipped.push({ row: rowNumber, reason: `Invalid Telegram user ID "${targetId}"` })
      return
    }
    if (seen.has(targetId)) {
      skipped.push({ row: rowNumber, reason: `Duplicate Telegram user ID ${targetId}` })
      return
    }
    if (!customName && !membershipId) {
      skipped.push({ row: rowNumber, reason: 'Nothing to import (no custom name or membership ID)' })
      return
    }
    seen.add(targetId)

    if (knownIds.has(targetId)) {
      updated += 1
      statements.push(
        c.env.MAIN_DB.prepare(
          `UPDATE members SET
             membership_id = COALESCE(?, membership_id),
             custom_name = COALESCE(?, custom_name),
             updated_at = ?
           WHERE telegram_user_id = ?`,
        ).bind(membershipId, customName, now, targetId),
      )
    } else {
      // display_name and username stay NULL until Telegram supplies them on first message
      created += 1
      statements.push(
        c.env.MAIN_DB.prepare(
          `INSERT INTO members
             (id, telegram_user_id, membership_id, custom_name, first_seen_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        ).bind(crypto.randomUUID(), targetId, membershipId, customName, now, now),
      )
    }
  })

  // D1 caps how much a single batch can carry, so send it in chunks
  for (let i = 0; i < statements.length; i += 50) {
    await c.env.MAIN_DB.batch(statements.slice(i, i + 50))
  }

  return c.json({ ok: true, updated, created, skipped })
})

apiRoutes.get('/members', async (c) => {
  const rows = await c.env.MAIN_DB.prepare(
    `SELECT
       m.*,
       COALESCE(SUM(s.messages_count), 0) AS messages_count,
       COALESCE(SUM(s.replies_count), 0) AS replies_count,
       COALESCE(SUM(s.reactions_count), 0) AS reactions_count
     FROM members m
     LEFT JOIN member_stats s ON s.telegram_user_id = m.telegram_user_id
     GROUP BY m.id
     ORDER BY m.display_name COLLATE NOCASE ASC`,
  ).all()

  return c.json({ members: rows.results ?? [] })
})

apiRoutes.get('/analytics', async (c) => {
  const rows = await c.env.MAIN_DB.prepare(
    `SELECT
       m.telegram_user_id,
       m.membership_id,
       m.display_name,
       m.username,
       COALESCE(SUM(s.messages_count), 0) AS messages_count,
       COALESCE(SUM(s.replies_count), 0) AS replies_count,
       COALESCE(SUM(s.reactions_count), 0) AS reactions_count,
       json_group_array(COALESCE(s.hashtag_count, '{}')) AS hashtag_counts
     FROM members m
     LEFT JOIN member_stats s ON s.telegram_user_id = m.telegram_user_id
     GROUP BY m.telegram_user_id
     ORDER BY messages_count DESC, replies_count DESC, reactions_count DESC`,
  ).all<Record<string, unknown> & { hashtag_counts: string }>()

  // Each member can have a row per chat, so the per-chat objects are summed here
  const analytics = (rows.results ?? []).map(({ hashtag_counts, ...row }) => {
    let perChat: unknown[] = []
    try {
      perChat = JSON.parse(hashtag_counts) as unknown[]
    } catch {
      perChat = []
    }
    return {
      ...row,
      hashtag_count: mergeHashtagCounts(
        {},
        ...perChat.map((raw) => parseHashtagCounts(typeof raw === 'string' ? raw : null)),
      ),
    }
  })

  return c.json({ analytics })
})

apiRoutes.get('/analytics/:chatId', async (c) => {
  const chatId = c.req.param('chatId')
  const rows = await c.env.MAIN_DB.prepare(
    `SELECT
       m.telegram_user_id,
       m.membership_id,
       m.display_name,
       m.username,
       COALESCE(s.messages_count, 0) AS messages_count,
       COALESCE(s.replies_count, 0) AS replies_count,
       COALESCE(s.reactions_count, 0) AS reactions_count,
       COALESCE(s.hashtag_count, '{}') AS hashtag_count
     FROM group_members gm
     JOIN members m ON m.telegram_user_id = gm.telegram_user_id
     LEFT JOIN member_stats s
       ON s.chat_id = gm.chat_id AND s.telegram_user_id = gm.telegram_user_id
     WHERE gm.chat_id = ?
     ORDER BY messages_count DESC, replies_count DESC, reactions_count DESC`,
  )
    .bind(chatId)
    .all<Record<string, unknown> & { hashtag_count: string }>()

  const analytics = (rows.results ?? []).map((row) => ({
    ...row,
    hashtag_count: parseHashtagCounts(row.hashtag_count),
  }))

  return c.json({ chat_id: chatId, analytics })
})

apiRoutes.get('/settings', async (c) => {
  const rows = await c.env.MAIN_DB.prepare(
    `SELECT key, value, updated_at FROM settings`,
  ).all<SettingRow>()
  const settings: Record<string, string> = {}
  for (const row of rows.results ?? []) {
    settings[row.key] = row.value
  }
  return c.json({ settings })
})

apiRoutes.patch('/settings', async (c) => {
  let body: { settings?: Record<string, string> }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON' }, 400)
  }

  if (!body.settings || typeof body.settings !== 'object') {
    return c.json({ error: 'settings object required' }, 400)
  }

  const now = new Date().toISOString()
  const stmts = Object.entries(body.settings).map(([key, value]) =>
    c.env.MAIN_DB.prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    ).bind(key, String(value), now),
  )

  if (stmts.length > 0) {
    await c.env.MAIN_DB.batch(stmts)
  }

  // Enabling Poll via Bot needs poll_answer on the webhook — re-register if URL is set
  let webhookRefreshed: boolean | undefined
  let webhookError: string | undefined
  const pollViaBot = body.settings.poll_via_bot
  const enablingPollViaBot =
    pollViaBot != null &&
    ['1', 'true', 'yes', 'on'].includes(String(pollViaBot).trim().toLowerCase())

  if (
    enablingPollViaBot &&
    c.env.TELEGRAM_BOT_TOKEN &&
    c.env.TELEGRAM_WEBHOOK_SECRET
  ) {
    const info = await getWebhookInfo(c.env.TELEGRAM_BOT_TOKEN)
    const existingUrl = info.ok ? info.result?.url?.trim() : ''
    if (existingUrl) {
      const refreshed = await setWebhook(
        c.env.TELEGRAM_BOT_TOKEN,
        existingUrl,
        c.env.TELEGRAM_WEBHOOK_SECRET,
      )
      webhookRefreshed = refreshed.ok
      if (!refreshed.ok) {
        webhookError = refreshed.description ?? 'Failed to refresh webhook'
      }
    }
  }

  const rows = await c.env.MAIN_DB.prepare(
    `SELECT key, value, updated_at FROM settings`,
  ).all<SettingRow>()
  const settings: Record<string, string> = {}
  for (const row of rows.results ?? []) {
    settings[row.key] = row.value
  }
  return c.json({ settings, webhook_refreshed: webhookRefreshed, webhook_error: webhookError })
})

apiRoutes.get('/telegram/webhook', async (c) => {
  if (!c.env.TELEGRAM_BOT_TOKEN) {
    return c.json({ error: 'TELEGRAM_BOT_TOKEN is not configured' }, 500)
  }

  const info = await getWebhookInfo(c.env.TELEGRAM_BOT_TOKEN)
  if (!info.ok) {
    return c.json(
      { error: info.description ?? 'Failed to fetch webhook info' },
      502,
    )
  }

  const origin = new URL(c.req.url).origin
  return c.json({
    webhook: info.result,
    suggested_url: `${origin}/telegram/webhook`,
    allowed_updates: [...ALLOWED_UPDATES],
  })
})

apiRoutes.post('/telegram/webhook', async (c) => {
  if (!c.env.TELEGRAM_BOT_TOKEN) {
    return c.json({ error: 'TELEGRAM_BOT_TOKEN is not configured' }, 500)
  }
  if (!c.env.TELEGRAM_WEBHOOK_SECRET) {
    return c.json({ error: 'TELEGRAM_WEBHOOK_SECRET is not configured' }, 500)
  }

  let body: { url?: string } = {}
  try {
    body = await c.req.json()
  } catch {
    body = {}
  }

  const origin = new URL(c.req.url).origin
  const raw = (body.url?.trim() || `${origin}/telegram/webhook`).replace(/\/$/, '')
  const webhookUrl = raw.endsWith('/telegram/webhook') ? raw : `${raw}/telegram/webhook`

  if (!webhookUrl.startsWith('https://')) {
    return c.json({ error: 'Webhook URL must use HTTPS' }, 400)
  }

  const result = await setWebhook(
    c.env.TELEGRAM_BOT_TOKEN,
    webhookUrl,
    c.env.TELEGRAM_WEBHOOK_SECRET,
  )

  if (!result.ok) {
    return c.json(
      { error: result.description ?? 'Failed to set webhook' },
      502,
    )
  }

  const info = await getWebhookInfo(c.env.TELEGRAM_BOT_TOKEN)
  return c.json({
    ok: true,
    url: webhookUrl,
    webhook: info.ok ? info.result : null,
  })
})

apiRoutes.delete('/telegram/webhook', async (c) => {
  if (!c.env.TELEGRAM_BOT_TOKEN) {
    return c.json({ error: 'TELEGRAM_BOT_TOKEN is not configured' }, 500)
  }

  const result = await deleteWebhook(c.env.TELEGRAM_BOT_TOKEN)
  if (!result.ok) {
    return c.json(
      { error: result.description ?? 'Failed to delete webhook' },
      502,
    )
  }

  return c.json({ ok: true })
})
