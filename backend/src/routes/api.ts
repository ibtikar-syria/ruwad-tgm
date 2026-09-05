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
  deleteWebhook,
  getWebhookInfo,
  setWebhook,
} from '../telegram/api'
import { upsertTopic } from '../db/members'

export const apiRoutes = new Hono<{ Bindings: CloudflareBindings; Variables: AppVariables }>()

apiRoutes.get('/groups', async (c) => {
  // Backfill topics from stored messages so forum threads aren't a flat message dump
  const threads = await c.env.TELEGRAM_MESSAGES_DB.prepare(
    `SELECT DISTINCT chat_id, message_thread_id
     FROM all_messages_groups
     WHERE message_thread_id IS NOT NULL AND message_thread_id != ''`,
  ).all<{ chat_id: string; message_thread_id: string }>()

  const titleRows = await c.env.TELEGRAM_MESSAGES_DB.prepare(
    `SELECT chat_id, message_thread_id, message_json
     FROM all_messages_groups
     WHERE message_json LIKE '%forum_topic_created%'
        OR message_json LIKE '%forum_topic_edited%'`,
  ).all<{ chat_id: string; message_thread_id: string; message_json: string }>()

  const titleByKey = new Map<string, string>()
  for (const row of titleRows.results ?? []) {
    if (!row.message_thread_id) continue
    try {
      const parsed = JSON.parse(row.message_json) as {
        forum_topic_created?: { name?: string }
        forum_topic_edited?: { name?: string }
      }
      const name =
        parsed.forum_topic_created?.name ?? parsed.forum_topic_edited?.name
      if (name) {
        titleByKey.set(`${row.chat_id}:${row.message_thread_id}`, name)
      }
    } catch {
      /* ignore */
    }
  }

  for (const row of threads.results ?? []) {
    await upsertTopic(c.env.MAIN_DB, row.chat_id, row.message_thread_id, {
      title: titleByKey.get(`${row.chat_id}:${row.message_thread_id}`) ?? null,
      isGeneral: row.message_thread_id === '1',
      markForum: true,
    })
  }

  const rows = await c.env.MAIN_DB.prepare(
    `SELECT chat_id, title, username, is_forum, is_active, added_at, updated_at
     FROM groups
     ORDER BY updated_at DESC`,
  ).all<GroupRow>()

  const topicRows = await c.env.MAIN_DB.prepare(
    `SELECT chat_id, message_thread_id, title, is_general, is_active, first_seen_at, updated_at
     FROM topics
     WHERE is_active = 1
     ORDER BY is_general DESC, title COLLATE NOCASE ASC, message_thread_id ASC`,
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
    if (before) {
      query = c.env.TELEGRAM_MESSAGES_DB.prepare(
        `SELECT id, message_json, message_text, chat_id, user_id, message_thread_id, notes, created_at
         FROM all_messages_groups
         WHERE chat_id = ? AND message_thread_id = ? AND created_at < ?
         ORDER BY created_at DESC
         LIMIT ?`,
      ).bind(chatId, threadId, before, limit)
    } else {
      query = c.env.TELEGRAM_MESSAGES_DB.prepare(
        `SELECT id, message_json, message_text, chat_id, user_id, message_thread_id, notes, created_at
         FROM all_messages_groups
         WHERE chat_id = ? AND message_thread_id = ?
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

  return c.json({
    messages: messages.map((m) => {
      let replyTo: { message_id?: number; text?: string } | null = null
      try {
        const parsed = JSON.parse(m.message_json) as {
          reply_to_message?: { message_id?: number; text?: string; caption?: string }
        }
        if (parsed.reply_to_message) {
          replyTo = {
            message_id: parsed.reply_to_message.message_id,
            text: parsed.reply_to_message.text ?? parsed.reply_to_message.caption,
          }
        }
      } catch {
        /* ignore */
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
      }
    }),
  })
})

apiRoutes.get('/groups/:chatId/members', async (c) => {
  const chatId = c.req.param('chatId')
  const rows = await c.env.MAIN_DB.prepare(
    `SELECT
       m.id,
       m.telegram_user_id,
       m.membership_id,
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

apiRoutes.patch('/members/:telegramUserId', async (c) => {
  const telegramUserId = c.req.param('telegramUserId')
  let body: { membership_id?: string | null }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON' }, 400)
  }

  if (!('membership_id' in body)) {
    return c.json({ error: 'membership_id is required' }, 400)
  }

  const membershipId =
    body.membership_id === null || body.membership_id === ''
      ? null
      : String(body.membership_id).trim()

  const now = new Date().toISOString()
  const result = await c.env.MAIN_DB.prepare(
    `UPDATE members SET membership_id = ?, updated_at = ? WHERE telegram_user_id = ?`,
  )
    .bind(membershipId, now, telegramUserId)
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
       COALESCE(SUM(s.reactions_count), 0) AS reactions_count
     FROM members m
     LEFT JOIN member_stats s ON s.telegram_user_id = m.telegram_user_id
     GROUP BY m.telegram_user_id
     ORDER BY messages_count DESC, replies_count DESC, reactions_count DESC`,
  ).all()

  return c.json({ analytics: rows.results ?? [] })
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
       COALESCE(s.reactions_count, 0) AS reactions_count
     FROM group_members gm
     JOIN members m ON m.telegram_user_id = gm.telegram_user_id
     LEFT JOIN member_stats s
       ON s.chat_id = gm.chat_id AND s.telegram_user_id = gm.telegram_user_id
     WHERE gm.chat_id = ?
     ORDER BY messages_count DESC, replies_count DESC, reactions_count DESC`,
  )
    .bind(chatId)
    .all()

  return c.json({ chat_id: chatId, analytics: rows.results ?? [] })
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

  const rows = await c.env.MAIN_DB.prepare(
    `SELECT key, value, updated_at FROM settings`,
  ).all<SettingRow>()
  const settings: Record<string, string> = {}
  for (const row of rows.results ?? []) {
    settings[row.key] = row.value
  }
  return c.json({ settings })
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
