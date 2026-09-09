import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api, type ChatMessage, type Group, type Topic } from '../api'
import { PollCard } from '../components/PollCard'
import { useI18n, type I18nValue } from '../i18n/context'
import { PrivateChatsPanel } from './PrivateChatsPanel'

function formatTime(iso: string, locale: string): string {
  const d = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z')
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString(locale, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4z" strokeLinejoin="round" />
      <path d="M14.5 5.5l4 4" strokeLinecap="round" />
    </svg>
  )
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

/** An admin rename wins over the name Telegram last reported. */
function topicLabel(topic: Topic, t: I18nValue['t']): string {
  if (topic.custom_title?.trim()) return topic.custom_title
  if (topic.title?.trim()) return topic.title
  if (topic.is_general || topic.message_thread_id === '1') return t('chats.general')
  return t('chats.topicNumber', { id: topic.message_thread_id })
}

function topicKey(chatId: string, threadId: string): string {
  return `${chatId}:${threadId}`
}

function isForumChat(chat: Group): boolean {
  return chat.is_forum === 1 || chat.topics.length > 0
}

export function ChatsPage() {
  const { t } = useI18n()
  const [searchParams, setSearchParams] = useSearchParams()
  const view = searchParams.get('view') === 'private' ? 'private' : 'groups'

  if (view === 'private') {
    return (
      <div className="chats-page">
        <nav className="chats-view-tabs" aria-label={t('chats.views')}>
          <button
            type="button"
            className="chats-view-tab"
            onClick={() => setSearchParams({})}
          >
            {t('chats.tabGroups')}
          </button>
          <button type="button" className="chats-view-tab active" aria-current="page">
            {t('chats.tabPrivate')}
          </button>
        </nav>
        <PrivateChatsPanel />
      </div>
    )
  }

  return <GroupsChatsPanel />
}

function GroupsChatsPanel() {
  const { t, dir, locale } = useI18n()
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
  const [editingTopic, setEditingTopic] = useState<string | null>(null)
  const [topicDraft, setTopicDraft] = useState('')
  const [savingTopic, setSavingTopic] = useState(false)

  async function loadChats() {
    setLoadingChats(true)
    setError(null)
    try {
      const res = await api.groups()
      setChats(res.groups)
      return res.groups
    } catch (err) {
      setError(err instanceof Error ? err.message : t('chats.loadFailed'))
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
      setError(err instanceof Error ? err.message : t('chats.messagesFailed'))
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
      setError(err instanceof Error ? err.message : t('chats.refreshFailed'))
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
    selected?.topics.find((topic) => topic.message_thread_id === selectedThreadId) ?? null
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
      ? `${selected.title || selected.chat_id} · ${topicLabel(selectedTopic, t)}`
      : selected.title || selected.chat_id
    : t('chats.select')

  // On mobile, show only the message pane once a concrete chat/topic is open
  const chatOpenOnMobile =
    Boolean(selectedChatId) && (!selectedIsForum || Boolean(selectedThreadId))

  function backToChatList() {
    setSelection(null, null)
  }

  function startTopicEdit(topic: Topic) {
    setEditingTopic(topicKey(topic.chat_id, topic.message_thread_id))
    setTopicDraft(topic.custom_title ?? topic.title ?? '')
    setError(null)
  }

  function cancelTopicEdit() {
    setEditingTopic(null)
    setTopicDraft('')
  }

  async function saveTopicTitle(topic: Topic) {
    const next = topicDraft.trim()
    // Clearing the field hands the name back to Telegram
    const customTitle = next === '' || next === topic.title?.trim() ? null : next
    setSavingTopic(true)
    setError(null)
    try {
      const res = await api.updateTopic(topic.chat_id, topic.message_thread_id, customTitle)
      setChats((prev) =>
        prev.map((chat) =>
          chat.chat_id === topic.chat_id
            ? {
                ...chat,
                topics: chat.topics.map((existing) =>
                  existing.message_thread_id === topic.message_thread_id ? res.topic : existing,
                ),
              }
            : chat,
        ),
      )
      cancelTopicEdit()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('chats.topicSaveFailed'))
    } finally {
      setSavingTopic(false)
    }
  }

  return (
    <div className="chats-page">
      <nav className="chats-view-tabs" aria-label={t('chats.views')}>
        <button type="button" className="chats-view-tab active" aria-current="page">
          {t('chats.tabGroups')}
        </button>
        <button
          type="button"
          className="chats-view-tab"
          onClick={() => setSearchParams({ view: 'private' })}
        >
          {t('chats.tabPrivate')}
        </button>
      </nav>
    <div className={`groups-layout${chatOpenOnMobile ? ' chat-open' : ''}`}>
      <aside className="group-list">
        <div className="pane-header">{t('chats.pane')}</div>
        {loadingChats && <p className="muted pad">{t('common.loading')}</p>}
        {!loadingChats && chats.length === 0 && (
          <p className="muted pad">{t('chats.empty')}</p>
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
                          ? g.topics.length === 1
                            ? t('chats.topicsOne')
                            : t('chats.topicsMany', { count: g.topics.length })
                          : g.is_active
                            ? g.username
                              ? `@${g.username}`
                              : t('chats.chat')
                            : t('chats.inactive')}
                      </span>
                    </span>
                  </button>
                  {forum && (
                    <button
                      type="button"
                      className="topic-toggle"
                      aria-label={expanded ? t('chats.collapseTopics') : t('chats.expandTopics')}
                      onClick={() => toggleForum(g.chat_id)}
                    >
                      {expanded ? '▾' : dir === 'rtl' ? '◂' : '▸'}
                    </button>
                  )}
                </div>
                {forum && expanded && (
                  <ul className="topic-list">
                    {g.topics.length === 0 && (
                      <li className="muted pad-sm">{t('chats.noTopics')}</li>
                    )}
                    {g.topics.map((topic) => {
                      const active =
                        g.chat_id === selectedChatId &&
                        topic.message_thread_id === selectedThreadId
                      const editing =
                        editingTopic === topicKey(topic.chat_id, topic.message_thread_id)
                      return (
                        <li key={topic.message_thread_id}>
                          {editing ? (
                            <form
                              className="topic-edit"
                              onSubmit={(e) => {
                                e.preventDefault()
                                void saveTopicTitle(topic)
                              }}
                            >
                              <input
                                value={topicDraft}
                                onChange={(e) => setTopicDraft(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Escape') cancelTopicEdit()
                                }}
                                placeholder={topic.title ?? t('chats.topicNamePlaceholder')}
                                aria-label={t('chats.topicName')}
                                maxLength={128}
                                autoFocus
                              />
                              <button
                                type="submit"
                                className="topic-edit-save"
                                disabled={savingTopic}
                                aria-label={t('common.save')}
                                title={t('common.save')}
                              >
                                ✓
                              </button>
                              <button
                                type="button"
                                className="topic-edit-cancel"
                                disabled={savingTopic}
                                onClick={cancelTopicEdit}
                                aria-label={t('chats.cancelRename')}
                                title={t('chats.cancelRename')}
                              >
                                ✕
                              </button>
                            </form>
                          ) : (
                            <div className="topic-row">
                              <button
                                type="button"
                                className={active ? 'topic-item active' : 'topic-item'}
                                onClick={() => selectTopic(g, topic)}
                              >
                                <span className="topic-hash">#</span>
                                <span className="topic-title">{topicLabel(topic, t)}</span>
                              </button>
                              <button
                                type="button"
                                className="topic-rename"
                                onClick={() => startTopicEdit(topic)}
                                aria-label={t('chats.renameTopic')}
                                title={t('chats.renameTopic')}
                              >
                                <PencilIcon />
                              </button>
                            </div>
                          )}
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
              aria-label={t('chats.back')}
            >
              {dir === 'rtl' ? '→' : '←'}
            </button>
            <span className="chat-header-title">{headerTitle}</span>
          </div>
          {selectedChatId && (!selectedIsForum || selectedThreadId) && (
            <button
              type="button"
              className="chat-refresh-btn"
              disabled={refreshing || loadingMessages}
              onClick={() => void refreshOpenChat()}
              title={t('chats.refreshTitle')}
            >
              {refreshing ? t('chats.refreshing') : t('chats.refresh')}
            </button>
          )}
        </div>
        {error && <p className="error pad">{error}</p>}
        <div className="message-scroll">
          {!selectedChatId && <p className="muted pad">{t('chats.selectToView')}</p>}
          {selectedIsForum && selectedChatId && !selectedThreadId && (
            <p className="muted pad">{t('chats.selectTopic')}</p>
          )}
          {loadingMessages && <p className="muted pad">{t('chats.loadingMessages')}</p>}
          {!loadingMessages &&
            selected &&
            (!selectedIsForum || selectedThreadId) &&
            messages.length === 0 && (
              <p className="muted pad">{t('chats.noMessages')}</p>
            )}
          {messages.map((m) => (
            <article key={m.id} className="bubble">
              <header className="bubble-head">
                <strong>{m.display_name}</strong>
                {m.membership_id && <span className="badge">{m.membership_id}</span>}
                <time>{formatTime(m.created_at, locale)}</time>
                <button
                  type="button"
                  className="msg-info-btn"
                  title={t('chats.viewJson')}
                  aria-label={t('chats.viewJson')}
                  onClick={() => setJsonMessage(m)}
                >
                  i
                </button>
              </header>
              {m.reply_to && (
                <div className="reply-preview">
                  {t('chats.reply', {
                    text: m.reply_to.text || `#${m.reply_to.message_id}`,
                  })}
                </div>
              )}
              {m.poll ? (
                <PollCard poll={m.poll} />
              ) : (
                <p className="bubble-text">
                  {m.text || <em className="muted">{t('chats.noText')}</em>}
                </p>
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
              <h2 id="json-modal-title">{t('chats.jsonTitle')}</h2>
              <button
                type="button"
                className="linkish"
                onClick={() => setJsonMessage(null)}
              >
                {t('common.close')}
              </button>
            </div>
            <p className="muted json-modal-meta">
              {t('chats.dbId')} <span className="mono">{jsonMessage.id}</span>
            </p>
            <pre className="json-modal-body">{formatMessageJson(jsonMessage.message_json)}</pre>
          </div>
        </div>
      )}
    </div>
    </div>
  )
}
