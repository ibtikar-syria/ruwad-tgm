const ALLOWED_UPDATES = [
  'message',
  'edited_message',
  'message_reaction',
  'my_chat_member',
  'poll',
  'poll_answer',
] as const

type TelegramApiResponse<T> = {
  ok: boolean
  result?: T
  description?: string
  error_code?: number
}

export type WebhookInfo = {
  url: string
  has_custom_certificate: boolean
  pending_update_count: number
  ip_address?: string
  last_error_date?: number
  last_error_message?: string
  last_synchronization_error_date?: number
  max_connections?: number
  allowed_updates?: string[]
}

async function callTelegramApi<T>(
  botToken: string,
  method: string,
  body?: Record<string, unknown>,
): Promise<TelegramApiResponse<T>> {
  const res = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  return (await res.json()) as TelegramApiResponse<T>
}

export async function getWebhookInfo(botToken: string): Promise<TelegramApiResponse<WebhookInfo>> {
  return callTelegramApi<WebhookInfo>(botToken, 'getWebhookInfo')
}

export async function setWebhook(
  botToken: string,
  url: string,
  secretToken: string,
): Promise<TelegramApiResponse<boolean>> {
  return callTelegramApi<boolean>(botToken, 'setWebhook', {
    url,
    secret_token: secretToken,
    allowed_updates: [...ALLOWED_UPDATES],
    drop_pending_updates: false,
  })
}

export async function deleteWebhook(botToken: string): Promise<TelegramApiResponse<boolean>> {
  return callTelegramApi<boolean>(botToken, 'deleteWebhook', {
    drop_pending_updates: false,
  })
}

export async function sendMessage(
  botToken: string,
  params: {
    chat_id: number | string
    text: string
    parse_mode?: 'HTML' | 'Markdown' | 'MarkdownV2'
    reply_to_message_id?: number
    message_thread_id?: number
  },
): Promise<TelegramApiResponse<TelegramMessageLike>> {
  return callTelegramApi(botToken, 'sendMessage', params)
}

export async function sendPoll(
  botToken: string,
  params: {
    chat_id: number | string
    question: string
    options: string[]
    is_anonymous?: boolean
    allows_multiple_answers?: boolean
    allows_revoting?: boolean
    allow_adding_options?: boolean
    type?: 'regular' | 'quiz'
    open_period?: number
    close_date?: number
    description?: string
    message_thread_id?: number
  },
): Promise<TelegramApiResponse<TelegramMessageLike>> {
  return callTelegramApi(botToken, 'sendPoll', {
    chat_id: params.chat_id,
    question: params.question,
    options: params.options.map((text) => ({ text })),
    is_anonymous: params.is_anonymous ?? false,
    allows_multiple_answers: params.allows_multiple_answers ?? false,
    type: params.type ?? 'regular',
    ...(params.allows_revoting != null ? { allows_revoting: params.allows_revoting } : {}),
    ...(params.allow_adding_options != null
      ? { allow_adding_options: params.allow_adding_options }
      : {}),
    ...(params.open_period != null ? { open_period: params.open_period } : {}),
    ...(params.close_date != null ? { close_date: params.close_date } : {}),
    ...(params.description ? { description: params.description } : {}),
    ...(params.message_thread_id != null
      ? { message_thread_id: params.message_thread_id }
      : {}),
  })
}

/** Returns the sent Message — for polls this includes current voter counts. */
export async function forwardMessage(
  botToken: string,
  params: {
    chat_id: number | string
    from_chat_id: number | string
    message_id: number
    message_thread_id?: number
    disable_notification?: boolean
  },
): Promise<TelegramApiResponse<TelegramMessageLike>> {
  return callTelegramApi(botToken, 'forwardMessage', {
    chat_id: params.chat_id,
    from_chat_id: params.from_chat_id,
    message_id: params.message_id,
    disable_notification: params.disable_notification ?? true,
    ...(params.message_thread_id != null
      ? { message_thread_id: params.message_thread_id }
      : {}),
  })
}

export async function deleteMessage(
  botToken: string,
  chatId: number | string,
  messageId: number,
): Promise<TelegramApiResponse<boolean>> {
  return callTelegramApi(botToken, 'deleteMessage', {
    chat_id: chatId,
    message_id: messageId,
  })
}

type TelegramMessageLike = {
  message_id: number
  date?: number
  from?: import('./types').TelegramUser
  chat: import('./types').TelegramChat
  text?: string
  message_thread_id?: number
  reply_to_message?: { message_id: number }
  poll?: import('./types').TelegramPoll
}

export { ALLOWED_UPDATES }
