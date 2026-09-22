import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type Member } from '../../api'
import { StatusBanner } from '../../components/StatusBanner'
import { useI18n, useTranslateRef } from '../../i18n/context'
import { exportMembersSheet } from '../../importMembers'

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
  const { t } = useI18n()
  const tRef = useTranslateRef()
  const [members, setMembers] = useState<Member[]>([])
  const [drafts, setDrafts] = useState<Record<string, MemberDraft>>({})
  const [query, setQuery] = useState('')
  const [savingId, setSavingId] = useState<string | null>(null)
  const [pendingActionId, setPendingActionId] = useState<string | null>(null)
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
          setError(err instanceof Error ? err.message : tRef.current('members.loadFailed'))
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [tRef])

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
        m.pending_membership_id,
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

  function applyMember(telegramUserId: string, member: Member) {
    setMembers((prev) =>
      prev.map((m) => (m.telegram_user_id === telegramUserId ? { ...m, ...member } : m)),
    )
    setDrafts((prev) => ({ ...prev, [telegramUserId]: draftFor(member) }))
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
      applyMember(telegramUserId, res.member)
      setMessage(t('members.saved'))
    } catch (err) {
      setError(err instanceof Error ? err.message : t('members.saveFailed'))
    } finally {
      setSavingId(null)
    }
  }

  async function acceptPending(telegramUserId: string) {
    setPendingActionId(telegramUserId)
    setMessage(null)
    setError(null)
    try {
      const res = await api.acceptPendingMembership(telegramUserId)
      applyMember(telegramUserId, res.member)
      setMessage(t('members.pendingAccepted'))
    } catch (err) {
      setError(err instanceof Error ? err.message : t('members.pendingAcceptFailed'))
    } finally {
      setPendingActionId(null)
    }
  }

  async function rejectPending(telegramUserId: string) {
    setPendingActionId(telegramUserId)
    setMessage(null)
    setError(null)
    try {
      const res = await api.rejectPendingMembership(telegramUserId)
      applyMember(telegramUserId, res.member)
      setMessage(t('members.pendingRejected'))
    } catch (err) {
      setError(err instanceof Error ? err.message : t('members.pendingRejectFailed'))
    } finally {
      setPendingActionId(null)
    }
  }

  if (loading) {
    return <p className="muted settings-loading">{t('members.loading')}</p>
  }

  const pendingCount = members.filter((m) => m.pending_membership_id?.trim()).length

  return (
    <div className="settings-stack">
      <StatusBanner message={message} error={error} />

      <section className="settings-panel">
        <div className="settings-panel-head">
          <div className="settings-panel-title-row">
            <h2>{t('members.heading')}</h2>
            <span className="status-chip status-neutral">
              {t('members.total', { count: members.length })}
            </span>
            {pendingCount > 0 && (
              <span className="status-chip status-pending">
                {t('members.pendingTotal', { count: pendingCount })}
              </span>
            )}
          </div>
          <p className="muted">
            {t('members.descLead')} {t('members.descBulk')}{' '}
            <Link to="../import">{t('settings.tabImport')}</Link>.
          </p>
        </div>

        <div className="settings-panel-actions button-row">
          <button
            type="button"
            className="secondary"
            disabled={members.length === 0}
            title={t('members.exportHint')}
            onClick={() =>
              exportMembersSheet(
                members.map((m) => ({
                  telegram_user_id: m.telegram_user_id,
                  username: m.username,
                  custom_name: m.custom_name,
                  membership_id: m.membership_id,
                })),
                t,
              )
            }
          >
            {t('members.export')}
          </button>
        </div>

        <label className="field field-search">
          <span className="field-label">{t('common.search')}</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('members.searchPlaceholder')}
          />
        </label>

        <div className="table-wrap members-table">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('column.member')}</th>
                <th>{t('column.telegramId')}</th>
                <th>{t('column.customName')}</th>
                <th>{t('column.membershipId')}</th>
                <th aria-label={t('column.actions')} />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="muted empty-cell">
                    {members.length === 0 ? t('members.emptyNone') : t('members.emptySearch')}
                  </td>
                </tr>
              )}
              {filtered.map((m) => {
                const draft = drafts[m.telegram_user_id] ?? draftFor(m)
                const dirty =
                  draft.membership_id !== (m.membership_id ?? '') ||
                  draft.custom_name !== (m.custom_name ?? '')
                const pending = m.pending_membership_id?.trim() || null
                const busy =
                  savingId === m.telegram_user_id || pendingActionId === m.telegram_user_id
                return (
                  <tr
                    key={m.telegram_user_id}
                    className={[dirty ? 'row-dirty' : '', pending ? 'row-pending' : '']
                      .filter(Boolean)
                      .join(' ') || undefined}
                  >
                    <td data-label={t('column.member')}>
                      <div className="cell-stack">
                        <strong>{m.display_name || m.telegram_user_id}</strong>
                        {m.username && <span className="muted">@{m.username}</span>}
                      </div>
                    </td>
                    <td data-label={t('column.telegramId')} className="mono">
                      {m.telegram_user_id}
                    </td>
                    <td data-label={t('column.customName')}>
                      <input
                        value={draft.custom_name}
                        onChange={(e) => updateDraft(m, 'custom_name', e.target.value)}
                        placeholder={t('members.customNamePlaceholder')}
                      />
                    </td>
                    <td data-label={t('column.membershipId')}>
                      <div className="membership-cell">
                        <input
                          value={draft.membership_id}
                          onChange={(e) => updateDraft(m, 'membership_id', e.target.value)}
                          placeholder={t('members.membershipIdPlaceholder')}
                        />
                        {pending && (
                          <div className="pending-membership">
                            <span className="pending-membership-label">
                              {t('members.pendingLabel')}:{' '}
                              <code>{pending}</code>
                            </span>
                            <div className="button-row pending-membership-actions">
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => acceptPending(m.telegram_user_id)}
                              >
                                {pendingActionId === m.telegram_user_id
                                  ? t('common.working')
                                  : t('members.acceptPending')}
                              </button>
                              <button
                                type="button"
                                className="danger"
                                disabled={busy}
                                onClick={() => rejectPending(m.telegram_user_id)}
                              >
                                {t('members.rejectPending')}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="actions-cell" data-label={t('column.actions')}>
                      <button
                        type="button"
                        className={dirty ? undefined : 'secondary'}
                        disabled={busy || !dirty}
                        onClick={() => saveMember(m.telegram_user_id)}
                      >
                        {savingId === m.telegram_user_id ? t('common.saving') : t('common.save')}
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
