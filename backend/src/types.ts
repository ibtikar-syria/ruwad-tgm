export type CloudflareBindings = {
  TELEGRAM_MESSAGES_DB: D1Database
  MAIN_DB: D1Database
  TELEGRAM_BOT_TOKEN: string
  TELEGRAM_WEBHOOK_SECRET: string
  ADMIN_SECRET: string
}

export type AppVariables = {
  admin: boolean
}

export type GroupRow = {
  chat_id: string
  title: string | null
  username: string | null
  is_forum: number
  is_active: number
  added_at: string
  updated_at: string
}

export type TopicRow = {
  chat_id: string
  message_thread_id: string
  title: string | null
  is_general: number
  is_active: number
  first_seen_at: string
  updated_at: string
}

export type MemberRow = {
  id: string
  telegram_user_id: string
  membership_id: string | null
  display_name: string | null
  username: string | null
  first_seen_at: string
  updated_at: string
}

export type MemberStatsRow = {
  chat_id: string
  telegram_user_id: string
  messages_count: number
  replies_count: number
  reactions_count: number
  updated_at: string
}

export type GroupMessageRow = {
  id: string
  message_json: string
  message_text: string | null
  chat_id: string
  user_id: string
  message_thread_id: string | null
  notes: string | null
  created_at: string
}

export type SettingRow = {
  key: string
  value: string
  updated_at: string
}
