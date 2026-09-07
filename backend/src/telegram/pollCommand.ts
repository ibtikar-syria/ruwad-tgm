export function isPollCommand(text: string | undefined): boolean {
  if (!text) return false
  const command = text.trim().split(/\s+|\n/)[0] ?? ''
  return /^\/pollm?(?:@[A-Za-z0-9_]+)?$/i.test(command)
}

/**
 * /poll Question
 * Option A
 * Option B
 *
 * or: /poll Question | Option A | Option B
 */
export function parsePollCommand(
  text: string,
): { question: string; options: string[]; allowsMultiple: boolean } | null {
  const trimmed = text.trim()
  const firstLineEnd = trimmed.indexOf('\n')
  const firstToken = (firstLineEnd === -1 ? trimmed : trimmed.slice(0, firstLineEnd)).trim()
  const cmdMatch = firstToken.match(/^\/poll(m)?(?:@[A-Za-z0-9_]+)?(?:\s+(.*))?$/i)
  if (!cmdMatch) return null

  const allowsMultiple = Boolean(cmdMatch[1])
  const restOfFirstLine = (cmdMatch[2] ?? '').trim()
  const body =
    firstLineEnd === -1
      ? restOfFirstLine
      : [restOfFirstLine, trimmed.slice(firstLineEnd + 1)].filter(Boolean).join('\n')

  if (!body) return null

  let question: string
  let options: string[]

  if (body.includes('|')) {
    const parts = body
      .split('|')
      .map((p) => p.trim())
      .filter(Boolean)
    question = parts[0] ?? ''
    options = parts.slice(1)
  } else {
    const lines = body
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
    question = lines[0] ?? ''
    options = lines.slice(1)
  }

  if (!question || options.length < 2 || options.length > 10) return null
  if (options.some((o) => o.length > 100) || question.length > 300) return null

  return { question, options, allowsMultiple }
}
