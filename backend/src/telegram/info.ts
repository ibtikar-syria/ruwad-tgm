import type { TelegramMessage } from './types'

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

export function isInfoCommand(text: string | undefined): boolean {
  if (!text) return false
  const command = text.trim().split(/\s+/)[0] ?? ''
  return /^\/info(?:@[A-Za-z0-9_]+)?$/i.test(command)
}

export function formatInfoMessageHtml(message: TelegramMessage): string {
  const chat = message.chat
  const sender = message.from
  const lines = [
    'Chat Info:',
    `ChatID: <code>${escapeHtml(String(chat.id))}</code>`,
    `ChatTitle: ${escapeHtml(chat.title ?? 'N/A')}`,
    `ChatType: <code>${escapeHtml(chat.type)}</code>`,
  ]
  if (typeof message.message_thread_id === 'number') {
    lines.push(
      `TopicID: <code>${escapeHtml(String(message.message_thread_id))}</code>`,
    )
  }
  if (sender) {
    lines.push(`SenderID: <code>${escapeHtml(String(sender.id))}</code>`)
    lines.push(
      `SenderUsername: <code>${escapeHtml(sender.username ?? 'N/A')}</code>`,
    )
    lines.push(
      `SenderName: ${escapeHtml(
        [sender.first_name, sender.last_name].filter(Boolean).join(' ') || 'N/A',
      )}`,
    )
  }
  return lines.join('\n')
}
