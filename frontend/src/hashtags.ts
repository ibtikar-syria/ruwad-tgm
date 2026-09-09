export type HashtagCounts = Record<string, number>

/** Most-used first, then alphabetical so repeat exports stay stable. */
export function sortedHashtags(counts: HashtagCounts | null | undefined): [string, number][] {
  if (!counts) return []
  return Object.entries(counts)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
}

/** Flattens the tallies into one spreadsheet cell, e.g. `#urgent: 3, #report: 1`. */
export function formatHashtags(counts: HashtagCounts | null | undefined): string {
  return sortedHashtags(counts)
    .map(([tag, count]) => `${tag}: ${count}`)
    .join(', ')
}
