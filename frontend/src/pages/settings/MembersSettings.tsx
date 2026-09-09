import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type Member } from '../../api'
import { StatusBanner } from '../../components/StatusBanner'

type MemberDraft = {
  membership_id: string
  custom_name: string
}

function draftFor(member: Member): MemberDraft {
  return {
    membership_id: member.membership_id ?? '',
    custom_name: member.custom_name ?? '',
  }
}

function draftsFor(members: Member[]): Record<string, MemberDraft> {
  const next: Record<string, MemberDraft> = {}
  for (const m of members) {
    next[m.telegram_user_id] = draftFor(m)
  }
  return next
}

export function MembersSettings() {
  const [members, setMembers] = useState<Member[]>([])
  const [drafts, setDrafts] = useState<Record<string, MemberDraft>>({})
  const [query, setQuery] = useState('')
  const [savingId, setSavingId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await api.members()
        if (cancelled) return
        setMembers(res.members)
        setDrafts(draftsFor(res.members))
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load members')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return members
    return members.filter((m) => {
      const hay = [
        m.display_name,
        m.username,
        m.telegram_user_id,
        drafts[m.telegram_user_id]?.membership_id,
        drafts[m.telegram_user_id]?.custom_name,
        m.membership_id,
        m.custom_name,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return hay.includes(q)
    })
  }, [members, query, drafts])

  function updateDraft(member: Member, field: keyof MemberDraft, value: string) {
    setDrafts((prev) => ({
      ...prev,
      [member.telegram_user_id]: {
        ...(prev[member.telegram_user_id] ?? draftFor(member)),
        [field]: value,
      },
    }))
  }

  async function saveMember(telegramUserId: string) {
    setSavingId(telegramUserId)
    setMessage(null)
    setError(null)
    try {
      const draft = drafts[telegramUserId]
      const res = await api.updateMember(telegramUserId, {
        membership_id: draft?.membership_id.trim() || null,
        custom_name: draft?.custom_name.trim() || null,
      })
      setMembers((prev) =>
        prev.map((m) =>
          m.telegram_user_id === telegramUserId ? { ...m, ...res.member } : m,
        ),
      )
      setDrafts((prev) => ({ ...prev, [telegramUserId]: draftFor(res.member) }))
      setMessage('Member saved.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSavingId(null)
    }
  }

  if (loading) {
    return <p className="muted settings-loading">Loading members…</p>
  }

  return (
    <div className="settings-stack">
      <StatusBanner message={message} error={error} />

      <section className="settings-panel">
        <div className="settings-panel-head">
          <div className="settings-panel-title-row">
            <h2>Members</h2>
            <span className="status-chip status-neutral">{members.length} total</span>
          </div>
          <p className="muted">
            Assign a membership ID and an optional custom name to each Telegram user. To fill these
            in bulk, use <Link to="../import">Import data</Link>.
          </p>
        </div>

        <label className="field field-search">
          <span className="field-label">Search</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Name, @username, Telegram ID, membership ID, custom name…"
          />
        </label>

        <div className="table-wrap members-table">
          <table className="data-table">
            <thead>
              <tr>
                <th>Member</th>
                <th>Telegram ID</th>
                <th>Custom name</th>
                <th>Membership ID</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="muted empty-cell">
                    {members.length === 0
                      ? 'No members yet. They appear when people message in tracked groups.'
                      : 'No members match your search.'}
                  </td>
                </tr>
              )}
              {filtered.map((m) => {
                const draft = drafts[m.telegram_user_id] ?? draftFor(m)
                const dirty =
                  draft.membership_id !== (m.membership_id ?? '') ||
                  draft.custom_name !== (m.custom_name ?? '')
                return (
                  <tr key={m.telegram_user_id} className={dirty ? 'row-dirty' : undefined}>
                    <td data-label="Member">
                      <div className="cell-stack">
                        <strong>{m.display_name || m.telegram_user_id}</strong>
                        {m.username && <span className="muted">@{m.username}</span>}
                      </div>
                    </td>
                    <td data-label="Telegram ID" className="mono">
                      {m.telegram_user_id}
                    </td>
                    <td data-label="Custom name">
                      <input
                        value={draft.custom_name}
                        onChange={(e) => updateDraft(m, 'custom_name', e.target.value)}
                        placeholder="e.g. Ahmad from Sales"
                      />
                    </td>
                    <td data-label="Membership ID">
                      <input
                        value={draft.membership_id}
                        onChange={(e) => updateDraft(m, 'membership_id', e.target.value)}
                        placeholder="e.g. EMP-001"
                      />
                    </td>
                    <td className="actions-cell" data-label="Actions">
                      <button
                        type="button"
                        className={dirty ? undefined : 'secondary'}
                        disabled={savingId === m.telegram_user_id || !dirty}
                        onClick={() => saveMember(m.telegram_user_id)}
                      >
                        {savingId === m.telegram_user_id ? 'Saving…' : 'Save'}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
