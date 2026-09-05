export type Group = {
  chat_id: string
  title: string | null
  username: string | null
  is_active: number
  added_at: string
  updated_at: string
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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
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
  messages: (chatId: string, opts?: { before?: string; limit?: number }) => {
    const params = new URLSearchParams()
    if (opts?.before) params.set('before', opts.before)
    if (opts?.limit) params.set('limit', String(opts.limit))
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
}
