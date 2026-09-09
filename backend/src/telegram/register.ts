import type { CloudflareBindings } from '../types'
import {
  clearBotDmState,
  getBotDmState,
  setBotDmState,
  setMemberCustomName,
} from '../db/botDm'
import { upsertMember } from '../db/members'
import { sendMessage } from './api'
import type { TelegramMessage, TelegramUser } from './types'

const MAX_NAME_LENGTH = 128
const MIN_NAME_LENGTH = 2

const COPY = {
  welcomeNew:
    'أهلاً بك 👋\nلإضافتك إلى النظام نحتاج اسمك.\n\nأرسل اسمك الكامل الآن.',
  welcomeKnown: (name: string) =>
    `أهلاً بك 👋\nأنت مسجّل باسم «${name}».\n\nلتغيير الاسم أرسل /name\nللإلغاء أثناء التعديل أرسل /cancel`,
  askName: 'حسناً، أرسل اسمك الكامل الآن.',
  saved: (name: string) =>
    `تم حفظ اسمك «${name}». شكراً لك ✅\n\nلتغييره لاحقاً أرسل /name`,
  cancelled: 'تم الإلغاء. يمكنك البدء من جديد بـ /start أو /name.',
  invalidName: `الرجاء إرسال اسم صالح (من ${MIN_NAME_LENGTH} إلى ${MAX_NAME_LENGTH} حرفاً)، بدون أوامر مثل /start.`,
  idleHelp: (name: string | null) =>
    name
      ? `أنت مسجّل باسم «${name}».\nلتغييره أرسل /name`
      : 'أرسل /start للتسجيل وإدخال اسمك.',
  help:
    'الأوامر المتاحة:\n/start — البدء أو عرض حالتك\n/name — تسجيل أو تغيير الاسم\n/cancel — إلغاء انتظار الاسم',
} as const

function isCommand(text: string, name: string): boolean {
  const command = text.trim().split(/\s+/)[0] ?? ''
  return new RegExp(`^/${name}(?:@[A-Za-z0-9_]+)?$`, 'i').test(command)
}

function normalizeName(text: string): string | null {
  const trimmed = text.trim().replace(/\s+/g, ' ')
  if (trimmed.length < MIN_NAME_LENGTH || trimmed.length > MAX_NAME_LENGTH) return null
  if (trimmed.startsWith('/')) return null
  return trimmed
}

async function reply(
  env: CloudflareBindings,
  chatId: number | string,
  text: string,
  replyTo?: number,
): Promise<void> {
  if (!env.TELEGRAM_BOT_TOKEN) return
  const result = await sendMessage(env.TELEGRAM_BOT_TOKEN, {
    chat_id: chatId,
    text,
    reply_to_message_id: replyTo,
  })
  if (!result.ok) {
    console.error('Failed to reply in private registration chat', result.description)
  }
}

/**
 * Private-chat registration: the user DMs the bot, we capture their Telegram ID,
 * ask for a name, and store it as `members.custom_name`.
 * Returns true when the message was handled by this flow (caller should skip other DM commands).
 */
export async function handlePrivateRegistration(
  env: CloudflareBindings,
  message: TelegramMessage,
): Promise<boolean> {
  if (message.chat.type !== 'private' || !message.from || message.from.is_bot) {
    return false
  }

  const user: TelegramUser = message.from
  const telegramUserId = String(user.id)
  const text = (message.text ?? message.caption ?? '').trim()

  // Always ensure the member row exists so the Telegram ID is known even before a name
  const member = await upsertMember(env.MAIN_DB, user)
  const state = await getBotDmState(env.MAIN_DB, telegramUserId)

  if (isCommand(text, 'cancel')) {
    await clearBotDmState(env.MAIN_DB, telegramUserId)
    await reply(env, message.chat.id, COPY.cancelled, message.message_id)
    return true
  }

  if (isCommand(text, 'help')) {
    await reply(env, message.chat.id, COPY.help, message.message_id)
    return true
  }

  if (isCommand(text, 'start')) {
    if (member.custom_name) {
      await clearBotDmState(env.MAIN_DB, telegramUserId)
      await reply(env, message.chat.id, COPY.welcomeKnown(member.custom_name), message.message_id)
      return true
    }
    await setBotDmState(env.MAIN_DB, telegramUserId, 'awaiting_name')
    await reply(env, message.chat.id, COPY.welcomeNew, message.message_id)
    return true
  }

  if (isCommand(text, 'name') || isCommand(text, 'rename')) {
    await setBotDmState(env.MAIN_DB, telegramUserId, 'awaiting_name')
    await reply(env, message.chat.id, COPY.askName, message.message_id)
    return true
  }

  // Waiting for a name (after /start or /name)
  if (state === 'awaiting_name') {
    if (!text || isCommand(text, 'info') || isCommand(text, 'poll') || isCommand(text, 'pollm')) {
      // Let other handlers deal with known commands; keep waiting for a name
      return false
    }
    const name = normalizeName(text)
    if (!name) {
      await reply(env, message.chat.id, COPY.invalidName, message.message_id)
      return true
    }
    await setMemberCustomName(env.MAIN_DB, telegramUserId, name)
    await clearBotDmState(env.MAIN_DB, telegramUserId)
    await reply(env, message.chat.id, COPY.saved(name), message.message_id)
    return true
  }

  // First contact without /start: nudge them into registration
  if (!member.custom_name && text && !text.startsWith('/')) {
    await setBotDmState(env.MAIN_DB, telegramUserId, 'awaiting_name')
    const name = normalizeName(text)
    if (name) {
      // They already typed a name as the first message — accept it
      await setMemberCustomName(env.MAIN_DB, telegramUserId, name)
      await clearBotDmState(env.MAIN_DB, telegramUserId)
      await reply(env, message.chat.id, COPY.saved(name), message.message_id)
      return true
    }
    await reply(env, message.chat.id, COPY.welcomeNew, message.message_id)
    return true
  }

  if (!text.startsWith('/')) {
    await reply(env, message.chat.id, COPY.idleHelp(member.custom_name), message.message_id)
    return true
  }

  // Unknown/other slash commands fall through (e.g. /info)
  return false
}
