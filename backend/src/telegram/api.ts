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
): Promise<TelegramApiResponse<unknown>> {
  return callTelegramApi(botToken, 'sendMessage', params)
}

export { ALLOWED_UPDATES }
