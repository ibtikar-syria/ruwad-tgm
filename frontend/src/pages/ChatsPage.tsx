import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api, type ChatMessage, type Group, type Topic } from '../api'
import { PollCard } from '../components/PollCard'

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

function isForumChat(chat: Group): boolean {
  return chat.is_forum === 1 || chat.topics.length > 0
}

export function ChatsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedChatId = searchParams.get('chat')
  const selectedThreadId = searchParams.get('thread')

  const [chats, setChats] = useState<Group[]>([])
  const [expandedForums, setExpandedForums] = useState<Record<string, boolean>>({})
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loadingChats, setLoadingChats] = useState(true)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [jsonMessage, setJsonMessage] = useState<ChatMessage | null>(null)

  async function loadChats() {
    setLoadingChats(true)
    setError(null)
    try {
      const res = await api.groups()
      setChats(res.groups)
      return res.groups
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load chats')
      return null
    } finally {
      setLoadingChats(false)
    }
  }

  async function loadMessages(
    chatId: string,
    threadId: string | null,
    groups: Group[],
    opts?: { quiet?: boolean },
  ) {
    const chat = groups.find((g) => g.chat_id === chatId)
    const forum = chat ? isForumChat(chat) : Boolean(threadId)
    if (forum && !threadId) {
      setMessages([])
      return
    }

    if (!opts?.quiet) setLoadingMessages(true)
    setError(null)
    try {
      const res = await api.messages(chatId, {
        limit: 100,
        threadId: forum ? threadId : null,
      })
      setMessages(res.messages)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load messages')
    } finally {
      if (!opts?.quiet) setLoadingMessages(false)
    }
  }

  useEffect(() => {
    void loadChats()
  }, [])

  // Expand forum when URL points at a chat/topic
  useEffect(() => {
    if (!selectedChatId) return
    setExpandedForums((prev) =>
      prev[selectedChatId] ? prev : { ...prev, [selectedChatId]: true },
    )
  }, [selectedChatId])

  useEffect(() => {
    if (!selectedChatId) {
      setMessages([])
      return
    }
    if (loadingChats) return
    void loadMessages(selectedChatId, selectedThreadId, chats)
  }, [selectedChatId, selectedThreadId, chats, loadingChats])

  async function refreshOpenChat() {
    if (!selectedChatId) return
    setRefreshing(true)
    setError(null)
    try {
      const groups = await api.groups()
      setChats(groups.groups)
      await loadMessages(selectedChatId, selectedThreadId, groups.groups, { quiet: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh')
    } finally {
      setRefreshing(false)
    }
  }

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
  const selectedIsForum = Boolean(selected && isForumChat(selected))

  function setSelection(chatId: string | null, threadId: string | null) {
    const next = new URLSearchParams()
    if (chatId) next.set('chat', chatId)
    if (chatId && threadId) next.set('thread', threadId)
    setSearchParams(next, { replace: false })
  }

  function selectChat(chat: Group) {
    const forum = isForumChat(chat)
    setExpandedForums((prev) => ({ ...prev, [chat.chat_id]: true }))
    if (forum) {
      // Open the group only; user picks a topic (unless URL already has one for this chat)
      setSelection(chat.chat_id, null)
    } else {
      setSelection(chat.chat_id, null)
    }
  }

  function selectTopic(chat: Group, topic: Topic) {
    setExpandedForums((prev) => ({ ...prev, [chat.chat_id]: true }))
    setSelection(chat.chat_id, topic.message_thread_id)
  }

  function toggleForum(chatId: string) {
    setExpandedForums((prev) => ({ ...prev, [chatId]: !prev[chatId] }))
  }

  const headerTitle = selected
    ? selectedIsForum && selectedTopic
      ? `${selected.title || selected.chat_id} · ${topicLabel(selectedTopic)}`
      : selected.title || selected.chat_id
    : 'Select a chat'

  // On mobile, show only the message pane once a concrete chat/topic is open
  const chatOpenOnMobile =
    Boolean(selectedChatId) && (!selectedIsForum || Boolean(selectedThreadId))

  function backToChatList() {
    setSelection(null, null)
  }

  return (
    <div className={`groups-layout${chatOpenOnMobile ? ' chat-open' : ''}`}>
      <aside className="group-list">
        <div className="pane-header">Chats</div>
        {loadingChats && <p className="muted pad">Loading…</p>}
        {!loadingChats && chats.length === 0 && (
          <p className="muted pad">No chats yet. Add the bot to a Telegram group.</p>
        )}
        <ul>
          {chats.map((g) => {
            const forum = isForumChat(g)
            const expanded = expandedForums[g.chat_id]
            const chatActive = g.chat_id === selectedChatId && !forum
            return (
              <li key={g.chat_id}>
                <div className="chat-row">
                  <button
                    type="button"
                    className={
                      chatActive || (g.chat_id === selectedChatId && forum && !selectedThreadId)
                        ? 'group-item active'
                        : 'group-item'
                    }
                    onClick={() => selectChat(g)}
                  >
                    <span className="avatar">{initials(g.title || 'C')}</span>
                    <span className="group-meta">
                      <span className="group-title">{g.title || g.chat_id}</span>
                      <span className="group-sub muted">
                        {forum
                          ? `${g.topics.length} topic${g.topics.length === 1 ? '' : 's'}`
                          : g.is_active
                            ? g.username
                              ? `@${g.username}`
                              : 'Chat'
                            : 'Inactive'}
                      </span>
                    </span>
                  </button>
                  {forum && (
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
                {forum && expanded && (
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
        <div className="pane-header chat-header">
          <div className="chat-header-leading">
            <button
              type="button"
              className="chat-back-btn"
              onClick={backToChatList}
              aria-label="Back to chats"
            >
              ←
            </button>
            <span className="chat-header-title">{headerTitle}</span>
          </div>
          {selectedChatId && (!selectedIsForum || selectedThreadId) && (
            <button
              type="button"
              className="chat-refresh-btn"
              disabled={refreshing || loadingMessages}
              onClick={() => void refreshOpenChat()}
              title="Refresh messages"
            >
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </button>
          )}
        </div>
        {error && <p className="error pad">{error}</p>}
        <div className="message-scroll">
          {!selectedChatId && <p className="muted pad">Select a chat to view messages.</p>}
          {selectedIsForum && selectedChatId && !selectedThreadId && (
            <p className="muted pad">Select a topic to view messages.</p>
          )}
          {loadingMessages && <p className="muted pad">Loading messages…</p>}
          {!loadingMessages &&
            selected &&
            (!selectedIsForum || selectedThreadId) &&
            messages.length === 0 && (
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
              {m.poll ? (
                <PollCard poll={m.poll} />
              ) : (
                <p className="bubble-text">{m.text || <em className="muted">(no text)</em>}</p>
              )}
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
