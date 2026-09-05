export type TelegramUser = {
  id: number
  is_bot?: boolean
  first_name?: string
  last_name?: string
  username?: string
}

export type TelegramChat = {
  id: number
  type: 'private' | 'group' | 'supergroup' | 'channel'
  title?: string
  username?: string
}

export type TelegramMessage = {
  message_id: number
  from?: TelegramUser
  chat: TelegramChat
  date: number
  text?: string
  caption?: string
  message_thread_id?: number
  reply_to_message?: TelegramMessage
}

export type TelegramReactionType = {
  type: string
  emoji?: string
  custom_emoji_id?: string
}

export type TelegramMessageReactionUpdated = {
  chat: TelegramChat
  message_id: number
  user?: TelegramUser
  actor_chat?: TelegramChat
  date: number
  old_reaction: TelegramReactionType[]
  new_reaction: TelegramReactionType[]
}

export type TelegramChatMemberUpdated = {
  chat: TelegramChat
  from: TelegramUser
  date: number
  old_chat_member: { status: string }
  new_chat_member: { status: string }
}

export type TelegramUpdate = {
  update_id: number
  message?: TelegramMessage
  edited_message?: TelegramMessage
  message_reaction?: TelegramMessageReactionUpdated
  my_chat_member?: TelegramChatMemberUpdated
}
