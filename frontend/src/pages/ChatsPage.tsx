import { useEffect, useState } from 'react'
import { api, type ChatMessage, type Group, type Topic } from '../api'

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

function formatMessageJson(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2)
  } catch {
    return raw
  }
}

function topicLabel(topic: Topic): string {
  if (topic.title?.trim()) return topic.title
  if (topic.is_general || topic.message_thread_id === '1') return 'General'
  return `Topic ${topic.message_thread_id}`
}

export function ChatsPage() {
  const [chats, setChats] = useState<Group[]>([])
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null)
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null)
  const [expandedForums, setExpandedForums] = useState<Record<string, boolean>>({})
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loadingChats, setLoadingChats] = useState(true)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [jsonMessage, setJsonMessage] = useState<ChatMessage | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoadingChats(true)
    api
      .groups()
      .then((res) => {
        if (cancelled) return
        setChats(res.groups)
        if (res.groups.length > 0) {
          const first = res.groups[0]
          setSelectedChatId((prev) => prev ?? first.chat_id)
          const isForum = first.is_forum === 1 || first.topics.length > 0
          if (isForum && first.topics.length > 0) {
            setExpandedForums((prev) => ({ ...prev, [first.chat_id]: true }))
            setSelectedThreadId((prev) => prev ?? first.topics[0].message_thread_id)
          }
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load chats')
      })
      .finally(() => {
        if (!cancelled) setLoadingChats(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!selectedChatId) {
      setMessages([])
      return
    }
    const chat = chats.find((g) => g.chat_id === selectedChatId)
    const isForum = Boolean(chat && (chat.is_forum === 1 || chat.topics.length > 0))
    if (isForum && !selectedThreadId) {
      setMessages([])
      return
    }

    let cancelled = false
    setLoadingMessages(true)
    setError(null)
    api
      .messages(selectedChatId, {
        limit: 100,
        threadId: isForum ? selectedThreadId : null,
      })
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
  }, [selectedChatId, selectedThreadId, chats])

  useEffect(() => {
    if (!jsonMessage) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setJsonMessage(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [jsonMessage])

  const selected = chats.find((g) => g.chat_id === selectedChatId) ?? null
  const selectedTopic =
    selected?.topics.find((t) => t.message_thread_id === selectedThreadId) ?? null
  const selectedIsForum = Boolean(
    selected && (selected.is_forum === 1 || selected.topics.length > 0),
  )

  function selectChat(chat: Group) {
    const isForum = chat.is_forum === 1 || chat.topics.length > 0
    setSelectedChatId(chat.chat_id)
    if (isForum) {
      setExpandedForums((prev) => ({ ...prev, [chat.chat_id]: true }))
      setSelectedThreadId(chat.topics[0]?.message_thread_id ?? null)
    } else {
      setSelectedThreadId(null)
    }
  }

  function selectTopic(chat: Group, topic: Topic) {
    setSelectedChatId(chat.chat_id)
    setSelectedThreadId(topic.message_thread_id)
    setExpandedForums((prev) => ({ ...prev, [chat.chat_id]: true }))
  }

  function toggleForum(chatId: string) {
    setExpandedForums((prev) => ({ ...prev, [chatId]: !prev[chatId] }))
  }

  const headerTitle = selected
    ? selectedIsForum && selectedTopic
      ? `${selected.title || selected.chat_id} · ${topicLabel(selectedTopic)}`
      : selected.title || selected.chat_id
    : 'Select a chat'

  return (
    <div className="groups-layout">
      <aside className="group-list">
        <div className="pane-header">Chats</div>
        {loadingChats && <p className="muted pad">Loading…</p>}
        {!loadingChats && chats.length === 0 && (
          <p className="muted pad">No chats yet. Add the bot to a Telegram group.</p>
        )}
        <ul>
          {chats.map((g) => {
            const isForum = g.is_forum === 1 || g.topics.length > 0
            const expanded = expandedForums[g.chat_id]
            const chatActive = g.chat_id === selectedChatId && !isForum
            return (
              <li key={g.chat_id}>
                <div className="chat-row">
                  <button
                    type="button"
                    className={
                      chatActive || (g.chat_id === selectedChatId && isForum && !selectedThreadId)
                        ? 'group-item active'
                        : 'group-item'
                    }
                    onClick={() => selectChat(g)}
                  >
                    <span className="avatar">{initials(g.title || 'C')}</span>
                    <span className="group-meta">
                      <span className="group-title">{g.title || g.chat_id}</span>
                      <span className="group-sub muted">
                        {isForum
                          ? `${g.topics.length} topic${g.topics.length === 1 ? '' : 's'}`
                          : g.is_active
                            ? g.username
                              ? `@${g.username}`
                              : 'Chat'
                            : 'Inactive'}
                      </span>
                    </span>
                  </button>
                  {isForum && (
                    <button
                      type="button"
                      className="topic-toggle"
                      aria-label={expanded ? 'Collapse topics' : 'Expand topics'}
                      onClick={() => toggleForum(g.chat_id)}
                    >
                      {expanded ? '▾' : '▸'}
                    </button>
                  )}
                </div>
                {isForum && expanded && (
                  <ul className="topic-list">
                    {g.topics.length === 0 && (
                      <li className="muted pad-sm">No topics discovered yet.</li>
                    )}
                    {g.topics.map((topic) => {
                      const active =
                        g.chat_id === selectedChatId &&
                        topic.message_thread_id === selectedThreadId
                      return (
                        <li key={topic.message_thread_id}>
                          <button
                            type="button"
                            className={active ? 'topic-item active' : 'topic-item'}
                            onClick={() => selectTopic(g, topic)}
                          >
                            <span className="topic-hash">#</span>
                            <span className="topic-title">{topicLabel(topic)}</span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </li>
            )
          })}
        </ul>
      </aside>

      <section className="chat-pane">
        <div className="pane-header chat-header">{headerTitle}</div>
        {error && <p className="error pad">{error}</p>}
        <div className="message-scroll">
          {selectedIsForum && !selectedThreadId && (
            <p className="muted pad">Select a topic to view messages.</p>
          )}
          {loadingMessages && <p className="muted pad">Loading messages…</p>}
          {!loadingMessages && selected && (!selectedIsForum || selectedThreadId) && messages.length === 0 && (
            <p className="muted pad">No messages stored yet.</p>
          )}
          {messages.map((m) => (
            <article key={m.id} className="bubble">
              <header className="bubble-head">
                <strong>{m.display_name}</strong>
                {m.membership_id && <span className="badge">{m.membership_id}</span>}
                <time>{formatTime(m.created_at)}</time>
                <button
                  type="button"
                  className="msg-info-btn"
                  title="View message JSON"
                  aria-label="View message JSON"
                  onClick={() => setJsonMessage(m)}
                >
                  i
                </button>
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

      {jsonMessage && (
        <div
          className="json-modal-backdrop"
          role="presentation"
          onClick={() => setJsonMessage(null)}
        >
          <div
            className="json-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="json-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="json-modal-header">
              <h2 id="json-modal-title">Message JSON</h2>
              <button
                type="button"
                className="linkish"
                onClick={() => setJsonMessage(null)}
              >
                Close
              </button>
            </div>
            <p className="muted json-modal-meta">
              DB id: <span className="mono">{jsonMessage.id}</span>
            </p>
            <pre className="json-modal-body">{formatMessageJson(jsonMessage.message_json)}</pre>
          </div>
        </div>
      )}
    </div>
  )
}
