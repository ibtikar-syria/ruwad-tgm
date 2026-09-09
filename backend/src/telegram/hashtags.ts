import type { TelegramMessage, TelegramMessageEntity } from './types'

export type HashtagCounts = Record<string, number>

/**
 * Telegram requires at least one letter, so a purely numeric "#2024" is not a
 * hashtag. Used only for the fallback scan; entities are authoritative.
 */
const HASHTAG_PATTERN = /#([\p{L}\p{N}_]*\p{L}[\p{L}\p{N}_]*)/gu

function normalize(tag: string): string | null {
  const trimmed = tag.trim().replace(/^#+/, '')
  if (!trimmed) return null
  // Arabic has no case, but this keeps #Report and #report as one tag
  return `#${trimmed.toLowerCase()}`
}

function fromEntities(
  text: string | undefined,
  entities: TelegramMessageEntity[] | undefined,
  into: Set<string>,
): void {
  if (!text || !entities) return
  for (const entity of entities) {
    if (entity.type !== 'hashtag') continue
    // Telegram offsets are UTF-16 code units, which is how JS indexes strings
    const tag = normalize(text.slice(entity.offset, entity.offset + entity.length))
    if (tag) into.add(tag)
  }
}

function fromText(text: string | undefined, into: Set<string>): void {
  if (!text) return
  for (const match of text.matchAll(HASHTAG_PATTERN)) {
    const tag = normalize(match[1])
    if (tag) into.add(tag)
  }
}

/**
 * Unique hashtags in a message. A tag repeated within one message yields a
 * single entry, while distinct tags each yield one.
 */
export function extractHashtags(message: TelegramMessage): string[] {
  const tags = new Set<string>()

  fromEntities(message.text, message.entities, tags)
  fromEntities(message.caption, message.caption_entities, tags)

  // Older stored messages and forwarded copies can arrive without entities
  if (tags.size === 0) {
    fromText(message.text, tags)
    fromText(message.caption, tags)
  }

  return [...tags]
}

export function parseHashtagCounts(raw: string | null | undefined): HashtagCounts {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const counts: HashtagCounts = {}
    for (const [tag, value] of Object.entries(parsed as Record<string, unknown>)) {
      const count = Number(value)
      if (Number.isFinite(count) && count > 0) counts[tag] = Math.trunc(count)
    }
    return counts
  } catch {
    return {}
  }
}

export function mergeHashtagCounts(base: HashtagCounts, ...others: HashtagCounts[]): HashtagCounts {
  const merged: HashtagCounts = { ...base }
  for (const other of others) {
    for (const [tag, count] of Object.entries(other)) {
      merged[tag] = (merged[tag] ?? 0) + count
    }
  }
  return merged
}

export function addHashtags(base: HashtagCounts, tags: string[]): HashtagCounts {
  const next: HashtagCounts = { ...base }
  for (const tag of tags) {
    next[tag] = (next[tag] ?? 0) + 1
  }
  return next
}
