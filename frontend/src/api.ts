export type Topic = {
  chat_id: string
  message_thread_id: string
  title: string | null
  is_general: number
  is_active: number
  first_seen_at: string
  updated_at: string
}

export type Group = {
  chat_id: string
  title: string | null
  username: string | null
  is_forum: number
  is_active: number
  added_at: string
  updated_at: string
  topics: Topic[]
}

export type PollVote = {
  user_id: string
  option_ids: number[]
  display_name: string
  username: string | null
  membership_id?: string | null
}

export type MessagePoll = {
  id: string
  question: string
  options: { text: string; voter_count: number }[]
  total_voter_count: number
  is_closed: boolean
  is_anonymous: boolean
  allows_multiple_answers: boolean
  type: string
  votes: PollVote[]
}

export type ChatMessage = {
  id: string
  chat_id: string
  user_id: string
  text: string | null
  created_at: string
  message_thread_id: string | null
  display_name: string
  username: string | null
  membership_id: string | null
  reply_to: { message_id?: number; text?: string } | null
  message_json: string
  poll: MessagePoll | null
}

export type Member = {
  id: string
  telegram_user_id: string
  membership_id: string | null
  display_name: string | null
  username: string | null
  first_seen_at: string
  updated_at: string
  messages_count?: number
  replies_count?: number
  reactions_count?: number
}

export type AnalyticsRow = {
  telegram_user_id: string
  membership_id: string | null
  display_name: string | null
  username: string | null
  messages_count: number
  replies_count: number
  reactions_count: number
}

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') ?? ''

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })

  if (!res.ok) {
    let message = res.statusText
    try {
      const body = (await res.json()) as { error?: string }
      if (body.error) message = body.error
    } catch {
      /* ignore */
    }
    throw new Error(message)
  }

  return res.json() as Promise<T>
}

export const api = {
  me: () => request<{ authenticated: boolean }>('/api/auth/me'),
  login: (secret: string) =>
    request<{ ok: boolean }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ secret }),
    }),
  logout: () =>
    request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),
  groups: () => request<{ groups: Group[] }>('/api/groups'),
  messages: (
    chatId: string,
    opts?: { before?: string; limit?: number; threadId?: string | null },
  ) => {
    const params = new URLSearchParams()
    if (opts?.before) params.set('before', opts.before)
    if (opts?.limit) params.set('limit', String(opts.limit))
    if (opts?.threadId) params.set('thread_id', opts.threadId)
    const qs = params.toString()
    return request<{ messages: ChatMessage[] }>(
      `/api/groups/${encodeURIComponent(chatId)}/messages${qs ? `?${qs}` : ''}`,
    )
  },
  analytics: (chatId?: string) =>
    chatId
      ? request<{ chat_id: string; analytics: AnalyticsRow[] }>(
          `/api/analytics/${encodeURIComponent(chatId)}`,
        )
      : request<{ analytics: AnalyticsRow[] }>('/api/analytics'),
  members: () => request<{ members: Member[] }>('/api/members'),
  updateMembershipId: (telegramUserId: string, membership_id: string | null) =>
    request<{ member: Member }>(`/api/members/${encodeURIComponent(telegramUserId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ membership_id }),
    }),
  settings: () => request<{ settings: Record<string, string> }>('/api/settings'),
  updateSettings: (settings: Record<string, string>) =>
    request<{ settings: Record<string, string> }>('/api/settings', {
      method: 'PATCH',
      body: JSON.stringify({ settings }),
    }),
  poll: (pollId: string) =>
    request<{ poll: MessagePoll }>(`/api/polls/${encodeURIComponent(pollId)}`),
  webhookInfo: () =>
    request<{
      webhook: {
        url: string
        pending_update_count: number
        last_error_date?: number
        last_error_message?: string
        allowed_updates?: string[]
      }
      suggested_url: string
      allowed_updates: string[]
    }>('/api/telegram/webhook'),
  setWebhook: (url?: string) =>
    request<{
      ok: boolean
      url: string
      webhook: {
        url: string
        pending_update_count: number
        last_error_date?: number
        last_error_message?: string
        allowed_updates?: string[]
      } | null
    }>('/api/telegram/webhook', {
      method: 'POST',
      body: JSON.stringify(url ? { url } : {}),
    }),
  deleteWebhook: () =>
    request<{ ok: boolean }>('/api/telegram/webhook', { method: 'DELETE' }),
}
