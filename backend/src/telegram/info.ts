import type { TelegramMessage } from './types'
import { isAnonymousAdminMessage } from './anonymousAdmin'

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
  if (isAnonymousAdminMessage(message)) {
    lines.push('Sender: Anonymous Admin (Remain anonymous)')
    if (message.author_signature) {
      lines.push(`Signature: ${escapeHtml(message.author_signature)}`)
    }
    if (message.sender_chat) {
      lines.push(
        `SenderChatID: <code>${escapeHtml(String(message.sender_chat.id))}</code>`,
      )
    }
  } else if (sender) {
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
