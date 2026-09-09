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
  is_forum?: boolean
}

export type TelegramPollOption = {
  text: string
  voter_count: number
  persistent_id?: string
  added_by_user?: TelegramUser
  addition_date?: number
}

export type TelegramPoll = {
  id: string
  question: string
  options: TelegramPollOption[]
  total_voter_count: number
  is_closed: boolean
  is_anonymous: boolean
  type: string
  allows_multiple_answers: boolean
  allows_revoting?: boolean
  /** Present on some payloads; not always included by Bot API for received polls */
  allow_adding_options?: boolean
  members_only?: boolean
  open_period?: number
  close_date?: number
  description?: string
}

export type TelegramPollAnswer = {
  poll_id: string
  user: TelegramUser
  option_ids: number[]
}

export type TelegramMessageEntity = {
  type: string
  offset: number
  length: number
}

export type TelegramMessage = {
  message_id: number
  from?: TelegramUser
  /**
   * Present when the message was sent on behalf of a chat — the group itself for
   * anonymous admins, or a linked channel for auto-forwards into a discussion group.
   */
  sender_chat?: TelegramChat
  /** Custom title of an anonymous group administrator, when shown as a signature */
  author_signature?: string
  chat: TelegramChat
  date: number
  text?: string
  caption?: string
  entities?: TelegramMessageEntity[]
  caption_entities?: TelegramMessageEntity[]
  message_thread_id?: number
  reply_to_message?: TelegramMessage
  is_topic_message?: boolean
  poll?: TelegramPoll
  forum_topic_created?: { name: string; icon_color?: number; icon_custom_emoji_id?: string }
  forum_topic_edited?: { name?: string; icon_custom_emoji_id?: string }
  forum_topic_closed?: Record<string, never>
  forum_topic_reopened?: Record<string, never>
  general_forum_topic_hidden?: Record<string, never>
  general_forum_topic_unhidden?: Record<string, never>
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
  poll?: TelegramPoll
  poll_answer?: TelegramPollAnswer
}
