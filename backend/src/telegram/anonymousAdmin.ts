import type { TelegramChat, TelegramMessage, TelegramUser } from './types'

/** Well-known Telegram user id for GroupAnonymousBot (fake `from` on anonymous posts). */
export const GROUP_ANONYMOUS_BOT_ID = 1087968824

/**
 * True when an admin posts with "Remain anonymous": Telegram hides the real user
 * and sets `sender_chat` to the group itself. The `from` field is then a fake bot
 * user (GroupAnonymousBot) kept only for backward compatibility.
 *
 * Channel auto-forwards into a discussion group also set `sender_chat`, but to the
 * *channel*, so they are excluded by comparing ids with the message's chat.
 */
export function isAnonymousAdminMessage(message: TelegramMessage): boolean {
  return Boolean(message.sender_chat && message.sender_chat.id === message.chat.id)
}

/** True when a reaction was made while remaining anonymous (no `user`, only `actor_chat`). */
export function isAnonymousAdminActor(
  chat: TelegramChat,
  actorChat: TelegramChat | undefined,
): boolean {
  return Boolean(actorChat && actorChat.id === chat.id)
}

/**
 * Synthetic member used for storage and stats. Telegram never reveals the real
 * admin id for these messages, so every anonymous post in every group shares
 * GroupAnonymousBot's id — the same id Telegram already puts in `from`.
 */
export function anonymousAdminAsUser(message: TelegramMessage): TelegramUser {
  const signature = message.author_signature?.trim()
  return {
    id: message.from?.id ?? GROUP_ANONYMOUS_BOT_ID,
    is_bot: false,
    first_name: signature || 'Anonymous Admin',
    username: message.from?.username ?? 'GroupAnonymousBot',
  }
}

export function anonymousActorAsUser(actorChat: TelegramChat): TelegramUser {
  return {
    id: GROUP_ANONYMOUS_BOT_ID,
    is_bot: false,
    first_name: actorChat.title?.trim() || 'Anonymous Admin',
    username: 'GroupAnonymousBot',
  }
}
