import type { TelegramMessage } from './types'

/** Topic title from the message itself or from reply_to_message (common for posts in a topic). */
export function extractTopicTitle(message: TelegramMessage): string | null {
  const direct =
    message.forum_topic_created?.name ??
    message.forum_topic_edited?.name ??
    null
  if (direct?.trim()) return direct.trim()

  const viaReply =
    message.reply_to_message?.forum_topic_created?.name ??
    message.reply_to_message?.forum_topic_edited?.name ??
    null
  if (viaReply?.trim()) return viaReply.trim()

  return null
}

export function extractTopicTitleFromJson(raw: string): string | null {
  try {
    const parsed = JSON.parse(raw) as TelegramMessage
    return extractTopicTitle(parsed)
  } catch {
    return null
  }
}
