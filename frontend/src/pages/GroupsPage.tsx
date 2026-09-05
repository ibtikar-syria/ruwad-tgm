import { useEffect, useState } from 'react'
import { api, type ChatMessage, type Group } from '../api'

function formatTime(iso: string): string {
  const d = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z')
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2)
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || '?'
}

export function GroupsPage() {
  const [groups, setGroups] = useState<Group[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loadingGroups, setLoadingGroups] = useState(true)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoadingGroups(true)
    api
      .groups()
      .then((res) => {
        if (cancelled) return
        setGroups(res.groups)
        if (res.groups.length > 0) {
          setSelectedId((prev) => prev ?? res.groups[0].chat_id)
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load groups')
      })
      .finally(() => {
        if (!cancelled) setLoadingGroups(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!selectedId) {
      setMessages([])
      return
    }
    let cancelled = false
    setLoadingMessages(true)
    setError(null)
    api
      .messages(selectedId, { limit: 100 })
      .then((res) => {
        if (!cancelled) setMessages(res.messages)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load messages')
      })
      .finally(() => {
        if (!cancelled) setLoadingMessages(false)
      })
    return () => {
      cancelled = true
    }
  }, [selectedId])

  const selected = groups.find((g) => g.chat_id === selectedId) ?? null

  return (
    <div className="groups-layout">
      <aside className="group-list">
        <div className="pane-header">Chats</div>
        {loadingGroups && <p className="muted pad">Loading…</p>}
        {!loadingGroups && groups.length === 0 && (
          <p className="muted pad">No groups yet. Add the bot to a Telegram group.</p>
        )}
        <ul>
          {groups.map((g) => (
            <li key={g.chat_id}>
              <button
                type="button"
                className={g.chat_id === selectedId ? 'group-item active' : 'group-item'}
                onClick={() => setSelectedId(g.chat_id)}
              >
                <span className="avatar">{initials(g.title || 'G')}</span>
                <span className="group-meta">
                  <span className="group-title">{g.title || g.chat_id}</span>
                  <span className="group-sub muted">
                    {g.is_active ? (g.username ? `@${g.username}` : 'Group') : 'Inactive'}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <section className="chat-pane">
        <div className="pane-header chat-header">
          {selected ? selected.title || selected.chat_id : 'Select a group'}
        </div>
        {error && <p className="error pad">{error}</p>}
        <div className="message-scroll">
          {loadingMessages && <p className="muted pad">Loading messages…</p>}
          {!loadingMessages && selected && messages.length === 0 && (
            <p className="muted pad">No messages stored yet.</p>
          )}
          {messages.map((m) => (
            <article key={m.id} className="bubble">
              <header className="bubble-head">
                <strong>{m.display_name}</strong>
                {m.membership_id && <span className="badge">{m.membership_id}</span>}
                <time>{formatTime(m.created_at)}</time>
              </header>
              {m.reply_to && (
                <div className="reply-preview">
                  Reply: {m.reply_to.text || `#${m.reply_to.message_id}`}
                </div>
              )}
              <p className="bubble-text">{m.text || <em className="muted">(no text)</em>}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
