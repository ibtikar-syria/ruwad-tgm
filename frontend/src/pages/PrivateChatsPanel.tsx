import { useEffect, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api, type PrivateChat, type PrivateChatMessage } from '../api'
import { useI18n } from '../i18n/context'

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

export function PrivateChatsPanel() {
  const { t, dir, locale } = useI18n()
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedChatId = searchParams.get('dm')

  const [chats, setChats] = useState<PrivateChat[]>([])
  const [messages, setMessages] = useState<PrivateChatMessage[]>([])
  const [loadingChats, setLoadingChats] = useState(true)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [sending, setSending] = useState(false)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [jsonMessage, setJsonMessage] = useState<PrivateChatMessage | null>(null)

  const selected = chats.find((c) => c.chat_id === selectedChatId) ?? null
  const chatOpenOnMobile = Boolean(selectedChatId)

  async function loadChats() {
    setLoadingChats(true)
    setError(null)
    try {
      const res = await api.privateChats()
      setChats(res.chats)
      return res.chats
    } catch (err) {
      setError(err instanceof Error ? err.message : t('private.loadFailed'))
      return null
    } finally {
      setLoadingChats(false)
    }
  }

  async function loadMessages(chatId: string, opts?: { quiet?: boolean }) {
    if (!opts?.quiet) setLoadingMessages(true)
    setError(null)
    try {
      const res = await api.privateMessages(chatId)
      setMessages(res.messages)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('private.messagesFailed'))
    } finally {
      if (!opts?.quiet) setLoadingMessages(false)
    }
  }

  useEffect(() => {
    void loadChats()
  }, [])

  useEffect(() => {
    if (!selectedChatId) {
      setMessages([])
      setDraft('')
      return
    }
    void loadMessages(selectedChatId)
  }, [selectedChatId])

  function selectChat(chatId: string) {
    setSearchParams({ view: 'private', dm: chatId })
  }

  function backToList() {
    setSearchParams({ view: 'private' })
  }

  async function refresh() {
    setRefreshing(true)
    try {
      await loadChats()
      if (selectedChatId) await loadMessages(selectedChatId, { quiet: true })
    } finally {
      setRefreshing(false)
    }
  }

  async function sendReply(e: FormEvent) {
    e.preventDefault()
    if (!selectedChatId || !draft.trim() || sending) return
    setSending(true)
    setError(null)
    try {
      const res = await api.sendPrivateMessage(selectedChatId, draft.trim())
      setMessages((prev) => [...prev, res.message])
      setDraft('')
      setChats((prev) => {
        const updated = prev.map((c) =>
          c.chat_id === selectedChatId
            ? {
                ...c,
                last_message_at: res.message.created_at,
                last_message_text: res.message.text,
                message_count: c.message_count + 1,
              }
            : c,
        )
        return updated.sort((a, b) => b.last_message_at.localeCompare(a.last_message_at))
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : t('private.sendFailed'))
    } finally {
      setSending(false)
    }
  }

  const headerTitle = selected
    ? selected.display_name
    : t('private.select')

  return (
    <div className={`groups-layout${chatOpenOnMobile ? ' chat-open' : ''}`}>
      <aside className="group-list">
        <div className="pane-header">{t('private.pane')}</div>
        {loadingChats && <p className="muted pad">{t('common.loading')}</p>}
        {!loadingChats && chats.length === 0 && (
          <p className="muted pad">{t('private.empty')}</p>
        )}
        <ul>
          {chats.map((c) => {
            const active = c.chat_id === selectedChatId
            return (
              <li key={c.chat_id}>
                <button
                  type="button"
                  className={active ? 'group-item active' : 'group-item'}
                  onClick={() => selectChat(c.chat_id)}
                >
                  <span className="avatar">{initials(c.display_name)}</span>
                  <span className="group-meta">
                    <span className="group-title">{c.display_name}</span>
                    <span className="group-sub muted">
                      {c.username
                        ? `@${c.username}`
                        : c.last_message_text || c.chat_id}
                    </span>
                  </span>
                </button>
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
              onClick={backToList}
              aria-label={t('private.back')}
            >
              {dir === 'rtl' ? '→' : '←'}
            </button>
            <span className="chat-header-title">{headerTitle}</span>
          </div>
          {selectedChatId && (
            <button
              type="button"
              className="chat-refresh-btn"
              disabled={refreshing || loadingMessages}
              onClick={() => void refresh()}
              title={t('chats.refreshTitle')}
            >
              {refreshing ? t('chats.refreshing') : t('chats.refresh')}
            </button>
          )}
        </div>

        {error && <p className="error pad">{error}</p>}

        <div className="message-scroll">
          {!selectedChatId && <p className="muted pad">{t('private.selectToView')}</p>}
          {loadingMessages && <p className="muted pad">{t('chats.loadingMessages')}</p>}
          {!loadingMessages && selectedChatId && messages.length === 0 && (
            <p className="muted pad">{t('chats.noMessages')}</p>
          )}
          {messages.map((m) => (
            <article
              key={m.id}
              className={`bubble${m.from_bot ? ' bubble-out' : ''}`}
            >
              <header className="bubble-head">
                <strong>{m.from_bot ? t('private.bot') : m.display_name}</strong>
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
              <p className="bubble-text">
                {m.text || <em className="muted">{t('chats.noText')}</em>}
              </p>
            </article>
          ))}
        </div>

        {selectedChatId && (
          <form className="private-composer" onSubmit={(e) => void sendReply(e)}>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={t('private.composerPlaceholder')}
              maxLength={4096}
              disabled={sending}
              aria-label={t('private.composerPlaceholder')}
            />
            <button type="submit" disabled={sending || !draft.trim()}>
              {sending ? t('private.sending') : t('private.send')}
            </button>
          </form>
        )}
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
            aria-labelledby="private-json-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="json-modal-header">
              <h2 id="private-json-modal-title">{t('chats.jsonTitle')}</h2>
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
  )
}
