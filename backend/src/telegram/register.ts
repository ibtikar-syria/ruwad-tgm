import type { CloudflareBindings } from '../types'
import {
  clearBotDmState,
  getBotDmState,
  setBotDmState,
  setMemberCustomName,
  setPendingMembershipId,
} from '../db/botDm'
import { upsertMember } from '../db/members'
import { storePrivateMessage } from '../db/privateMessages'
import { sendMessage } from './api'
import type { TelegramMessage, TelegramUser } from './types'

const MAX_NAME_LENGTH = 128
const MIN_NAME_LENGTH = 2
const MAX_MEMBERSHIP_ID_LENGTH = 64
const MIN_MEMBERSHIP_ID_LENGTH = 1

const COPY = {
  welcomeNew:
    'أهلاً بك 👋\nلإضافتك إلى النظام نحتاج اسمك.\n\nأرسل اسمك الكامل الآن.\n\nبعد التسجيل يمكنك معرفة بياناتك عبر /info',
  welcomeKnown: (name: string, pendingId: string | null) => {
    const pendingLine = pendingId
      ? `\nرقم العضوية قيد المراجعة: «${pendingId}»`
      : ''
    return `أهلاً بك 👋\nأنت مسجّل باسم «${name}».${pendingLine}\n\nلتغيير الاسم أرسل /name\nلإرسال رقم العضوية أرسل /id\nلمعرفة بياناتك أرسل /info\nللإلغاء أثناء التعديل أرسل /cancel`
  },
  askName: 'حسناً، أرسل اسمك الكامل الآن.',
  saved: (name: string) =>
    `تم حفظ اسمك «${name}». شكراً لك ✅\n\nلتغييره لاحقاً أرسل /name\nلإرسال رقم العضوية أرسل /id\nلمعرفة بياناتك أرسل /info`,
  askMembershipId:
    'أرسل رقم العضوية الآن.\n\nسيُحفظ مؤقتاً حتى يراجعه المشرف ويقبله.',
  pendingSaved: (id: string) =>
    `تم استلام رقم العضوية «${id}».\nسيراجعه المشرف قبل اعتماده ✅\n\nلتغيير الطلب أرسل /id مرة أخرى`,
  pendingAlready: (id: string) =>
    `لديك رقم عضوية قيد المراجعة: «${id}».\nلإرسال رقم جديد أرسل /id`,
  cancelled: 'تم الإلغاء. يمكنك البدء من جديد بـ /start أو /name أو /id.',
  invalidName: `الرجاء إرسال اسم صالح (من ${MIN_NAME_LENGTH} إلى ${MAX_NAME_LENGTH} حرفاً)، بدون أوامر مثل /start.`,
  invalidMembershipId: `الرجاء إرسال رقم عضوية صالح (من ${MIN_MEMBERSHIP_ID_LENGTH} إلى ${MAX_MEMBERSHIP_ID_LENGTH} حرفاً)، بدون أوامر.`,
  idleHelp: (name: string | null, pendingId: string | null) => {
    if (!name) {
      return 'أرسل /start للتسجيل وإدخال اسمك.\nلمعرفة بياناتك أرسل /info'
    }
    const pendingLine = pendingId
      ? `\nرقم العضوية قيد المراجعة: «${pendingId}»`
      : ''
    return `أنت مسجّل باسم «${name}».${pendingLine}\nلتغيير الاسم أرسل /name\nلإرسال رقم العضوية أرسل /id\nلمعرفة بياناتك أرسل /info`
  },
  help:
    'الأوامر المتاحة:\n/start — البدء أو عرض حالتك\n/name — تسجيل أو تغيير الاسم\n/id — إرسال رقم العضوية (بانتظار موافقة المشرف)\n/info — عرض معلوماتك\n/cancel — إلغاء الانتظار الحالي',
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

function normalizeMembershipId(text: string): string | null {
  const trimmed = text.trim().replace(/\s+/g, ' ')
  if (
    trimmed.length < MIN_MEMBERSHIP_ID_LENGTH ||
    trimmed.length > MAX_MEMBERSHIP_ID_LENGTH
  ) {
    return null
  }
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
    return
  }
  if (result.result) {
    await storePrivateMessage(env.TELEGRAM_MESSAGES_DB, result.result as TelegramMessage)
  }
}

/**
 * Private-chat registration: capture Telegram ID, ask for name (custom_name),
 * and optionally a membership ID stored as pending until an admin approves it.
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
  const pendingId = member.pending_membership_id

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
      await reply(
        env,
        message.chat.id,
        COPY.welcomeKnown(member.custom_name, pendingId),
        message.message_id,
      )
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

  if (isCommand(text, 'id') || isCommand(text, 'membership')) {
    await setBotDmState(env.MAIN_DB, telegramUserId, 'awaiting_membership_id')
    await reply(env, message.chat.id, COPY.askMembershipId, message.message_id)
    return true
  }

  // Waiting for a name (after /start or /name)
  if (state === 'awaiting_name') {
    if (
      !text ||
      isCommand(text, 'info') ||
      isCommand(text, 'poll') ||
      isCommand(text, 'pollm') ||
      isCommand(text, 'id') ||
      isCommand(text, 'membership')
    ) {
      return false
    }
    const name = normalizeName(text)
    if (!name) {
      await reply(env, message.chat.id, COPY.invalidName, message.message_id)
      return true
    }
    await setMemberCustomName(env.MAIN_DB, telegramUserId, name)
    // After the name, invite them to submit a membership ID for admin review
    await setBotDmState(env.MAIN_DB, telegramUserId, 'awaiting_membership_id')
    await reply(
      env,
      message.chat.id,
      `${COPY.saved(name)}\n\n${COPY.askMembershipId}`,
      message.message_id,
    )
    return true
  }

  // Waiting for a membership ID (never writes membership_id — only pending)
  if (state === 'awaiting_membership_id') {
    if (
      !text ||
      isCommand(text, 'info') ||
      isCommand(text, 'poll') ||
      isCommand(text, 'pollm') ||
      isCommand(text, 'name') ||
      isCommand(text, 'rename')
    ) {
      return false
    }
    const membershipId = normalizeMembershipId(text)
    if (!membershipId) {
      await reply(env, message.chat.id, COPY.invalidMembershipId, message.message_id)
      return true
    }
    await setPendingMembershipId(env.MAIN_DB, telegramUserId, membershipId)
    await clearBotDmState(env.MAIN_DB, telegramUserId)
    await reply(env, message.chat.id, COPY.pendingSaved(membershipId), message.message_id)
    return true
  }

  // First contact without /start: nudge them into registration
  if (!member.custom_name && text && !text.startsWith('/')) {
    await setBotDmState(env.MAIN_DB, telegramUserId, 'awaiting_name')
    const name = normalizeName(text)
    if (name) {
      await setMemberCustomName(env.MAIN_DB, telegramUserId, name)
      await setBotDmState(env.MAIN_DB, telegramUserId, 'awaiting_membership_id')
      await reply(
        env,
        message.chat.id,
        `${COPY.saved(name)}\n\n${COPY.askMembershipId}`,
        message.message_id,
      )
      return true
    }
    await reply(env, message.chat.id, COPY.welcomeNew, message.message_id)
    return true
  }

  if (!text.startsWith('/')) {
    await reply(
      env,
      message.chat.id,
      COPY.idleHelp(member.custom_name, pendingId),
      message.message_id,
    )
    return true
  }

  // Unknown/other slash commands fall through (e.g. /info)
  return false
}
