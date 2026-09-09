import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { api, type Member } from '../api'
import {
  downloadMemberTemplate,
  IMPORT_ACCEPT,
  parseMemberFile,
  type MemberImportRow,
} from '../importMembers'

function settingIsOn(value: string | undefined): boolean {
  const v = (value ?? '').trim().toLowerCase()
  return v === '1' || v === 'true' || v === 'yes' || v === 'on'
}

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

export function SettingsPage() {
  const [members, setMembers] = useState<Member[]>([])
  const [drafts, setDrafts] = useState<Record<string, MemberDraft>>({})
  const [savingId, setSavingId] = useState<string | null>(null)
  const [memberQuery, setMemberQuery] = useState('')
  const [appName, setAppName] = useState('')
  const [pollViaBot, setPollViaBot] = useState(false)
  const [webhookUrl, setWebhookUrl] = useState('')
  const [webhookStatus, setWebhookStatus] = useState<{
    url: string
    pending_update_count: number
    last_error_message?: string
    last_error_date?: number
    allowed_updates?: string[]
  } | null>(null)
  const [webhookBusy, setWebhookBusy] = useState(false)
  const [savingSettings, setSavingSettings] = useState(false)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [importFileName, setImportFileName] = useState<string | null>(null)
  const [importRows, setImportRows] = useState<MemberImportRow[]>([])
  const [importSkipped, setImportSkipped] = useState<{ row: number; reason: string }[]>([])
  const [importError, setImportError] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)

  async function loadWebhook() {
    const res = await api.webhookInfo()
    setWebhookStatus(res.webhook)
    setWebhookUrl(res.webhook.url || res.suggested_url)
  }

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [membersRes, settingsRes] = await Promise.all([
        api.members(),
        api.settings(),
      ])
      setMembers(membersRes.members)
      const next: Record<string, MemberDraft> = {}
      for (const m of membersRes.members) {
        next[m.telegram_user_id] = draftFor(m)
      }
      setDrafts(next)
      setAppName(settingsRes.settings.app_name ?? '')
      setPollViaBot(settingIsOn(settingsRes.settings.poll_via_bot))
      await loadWebhook()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load settings')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const filteredMembers = useMemo(() => {
    const q = memberQuery.trim().toLowerCase()
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
  }, [members, memberQuery, drafts])

  const webhookConnected = Boolean(webhookStatus?.url)
  const webhookHasError = Boolean(webhookStatus?.last_error_message)

  async function saveMember(telegramUserId: string) {
    setSavingId(telegramUserId)
    setMessage(null)
    setError(null)
    try {
      const draft = drafts[telegramUserId]
      await api.updateMember(telegramUserId, {
        membership_id: draft?.membership_id.trim() || null,
        custom_name: draft?.custom_name.trim() || null,
      })
      setMessage('Member saved.')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSavingId(null)
    }
  }

  function resetImport() {
    setImportFileName(null)
    setImportRows([])
    setImportSkipped([])
    setImportError(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleImportFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setMessage(null)
    setError(null)
    setImportError(null)
    setImportFileName(file.name)
    try {
      const parsed = await parseMemberFile(file)
      setImportRows(parsed.rows)
      setImportSkipped(parsed.skipped)
      if (parsed.rows.length === 0) {
        setImportError('No importable rows found in this file.')
      }
    } catch (err) {
      setImportRows([])
      setImportSkipped([])
      setImportError(err instanceof Error ? err.message : 'Could not read this file')
    }
  }

  async function runImport() {
    if (importRows.length === 0) return
    setImporting(true)
    setMessage(null)
    setError(null)
    try {
      const res = await api.importMembers(
        importRows.map((r) => ({
          telegram_user_id: r.telegram_user_id,
          username: r.username,
          custom_name: r.custom_name,
          membership_id: r.membership_id,
        })),
      )
      const parts = [`${res.updated} updated`, `${res.created} created`]
      if (res.skipped.length > 0) parts.push(`${res.skipped.length} skipped`)
      setMessage(`Import finished: ${parts.join(', ')}.`)
      resetImport()
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setImporting(false)
    }
  }

  function updateDraft(
    member: Member,
    field: keyof MemberDraft,
    value: string,
  ) {
    setDrafts((prev) => ({
      ...prev,
      [member.telegram_user_id]: {
        ...(prev[member.telegram_user_id] ?? draftFor(member)),
        [field]: value,
      },
    }))
  }

  async function saveSettings(e: FormEvent) {
    e.preventDefault()
    setMessage(null)
    setError(null)
    setSavingSettings(true)
    try {
      const res = await api.updateSettings({
        app_name: appName,
        poll_via_bot: pollViaBot ? 'true' : 'false',
      })
      let msg = 'Settings saved.'
      if (pollViaBot && res.webhook_refreshed) {
        msg += ' Webhook refreshed so poll votes can be tracked.'
      } else if (pollViaBot && res.webhook_error) {
        msg += ` Warning: could not refresh webhook (${res.webhook_error}). Use Set webhook below.`
      } else if (pollViaBot && !webhookStatus?.url) {
        msg += ' Set the Telegram webhook below so poll answers are received.'
      }
      setMessage(msg)
      if (res.webhook_refreshed) await loadWebhook()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSavingSettings(false)
    }
  }

  async function applyWebhook(e: FormEvent) {
    e.preventDefault()
    setWebhookBusy(true)
    setMessage(null)
    setError(null)
    try {
      const res = await api.setWebhook(webhookUrl.trim() || undefined)
      setWebhookStatus(res.webhook)
      setWebhookUrl(res.url)
      setMessage('Telegram webhook set.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set webhook')
    } finally {
      setWebhookBusy(false)
    }
  }

  async function refreshWebhook() {
    setWebhookBusy(true)
    setMessage(null)
    setError(null)
    try {
      await loadWebhook()
      setMessage('Webhook status refreshed.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh webhook')
    } finally {
      setWebhookBusy(false)
    }
  }

  async function removeWebhook() {
    if (!confirm('Remove the Telegram webhook? The bot will stop receiving updates.')) {
      return
    }
    setWebhookBusy(true)
    setMessage(null)
    setError(null)
    try {
      await api.deleteWebhook()
      await loadWebhook()
      setMessage('Telegram webhook removed.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove webhook')
    } finally {
      setWebhookBusy(false)
    }
  }

  return (
    <div className="section-page settings-page">
      <header className="page-header">
        <div>
          <h1>Settings</h1>
          <p className="page-subtitle">
            Configure the app, Telegram webhook, and member membership IDs.
          </p>
        </div>
      </header>

      {message && (
        <div className="banner banner-ok" role="status">
          {message}
        </div>
      )}
      {error && (
        <div className="banner banner-error" role="alert">
          {error}
        </div>
      )}

      {loading ? (
        <p className="muted settings-loading">Loading settings…</p>
      ) : (
        <div className="settings-stack">
          <form className="settings-panel" onSubmit={saveSettings}>
            <div className="settings-panel-head">
              <h2>General</h2>
              <p className="muted">App identity and poll behavior.</p>
            </div>

            <label className="field">
              <span className="field-label">Display name</span>
              <input
                value={appName}
                onChange={(e) => setAppName(e.target.value)}
                placeholder="Group Manager"
              />
            </label>

            <div className="feature-row">
              <div className="feature-copy">
                <div className="feature-title-row">
                  <strong>Poll via Bot</strong>
                  <span className={`status-chip ${pollViaBot ? 'status-on' : 'status-off'}`}>
                    {pollViaBot ? 'On' : 'Off'}
                  </span>
                </div>
                <p className="muted feature-desc">
                  Delete member polls and re-send them as public bot polls so votes can be tracked.
                  The bot needs admin rights with <strong>Delete messages</strong>. Saving while
                  enabled refreshes the webhook for <code>poll_answer</code>.
                </p>
              </div>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={pollViaBot}
                  onChange={(e) => setPollViaBot(e.target.checked)}
                  aria-label="Enable Poll via Bot"
                />
                <span className="switch-track" aria-hidden="true" />
              </label>
            </div>

            <div className="settings-panel-actions">
              <button type="submit" disabled={savingSettings}>
                {savingSettings ? 'Saving…' : 'Save general settings'}
              </button>
            </div>
          </form>

          <form className="settings-panel" onSubmit={applyWebhook}>
            <div className="settings-panel-head">
              <div className="settings-panel-title-row">
                <h2>Telegram webhook</h2>
                <span
                  className={`status-chip ${
                    !webhookConnected
                      ? 'status-off'
                      : webhookHasError
                        ? 'status-warn'
                        : 'status-on'
                  }`}
                >
                  {!webhookConnected ? 'Not set' : webhookHasError ? 'Error' : 'Connected'}
                </span>
              </div>
              <p className="muted">
                Point Telegram at this backend so messages, reactions, and poll votes are ingested.
                URL must be HTTPS. Secret comes from <code>TELEGRAM_WEBHOOK_SECRET</code>.
              </p>
            </div>

            <label className="field">
              <span className="field-label">Webhook URL</span>
              <input
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder="https://your-worker.workers.dev/telegram/webhook"
                required
              />
            </label>

            <div className="meta-grid">
              <div className="meta-item">
                <span className="meta-label">Current URL</span>
                <span className="meta-value mono">
                  {webhookStatus?.url || '—'}
                </span>
              </div>
              <div className="meta-item">
                <span className="meta-label">Pending updates</span>
                <span className="meta-value">
                  {webhookStatus ? webhookStatus.pending_update_count : '—'}
                </span>
              </div>
              {webhookStatus?.last_error_message && (
                <div className="meta-item meta-item-wide">
                  <span className="meta-label">Last error</span>
                  <span className="meta-value error">{webhookStatus.last_error_message}</span>
                </div>
              )}
              {webhookStatus?.allowed_updates && webhookStatus.allowed_updates.length > 0 && (
                <div className="meta-item meta-item-wide">
                  <span className="meta-label">Allowed updates</span>
                  <div className="tag-row">
                    {webhookStatus.allowed_updates.map((u) => (
                      <span key={u} className="tag">
                        {u}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="settings-panel-actions button-row">
              <button type="submit" disabled={webhookBusy}>
                {webhookBusy ? 'Working…' : 'Set webhook'}
              </button>
              <button
                type="button"
                className="secondary"
                disabled={webhookBusy}
                onClick={refreshWebhook}
              >
                Refresh status
              </button>
              <button
                type="button"
                className="danger"
                disabled={webhookBusy || !webhookConnected}
                onClick={removeWebhook}
              >
                Remove
              </button>
            </div>
          </form>

          <section className="settings-panel">
            <div className="settings-panel-head">
              <h2>Import data</h2>
              <p className="muted">
                Bulk-assign custom names and membership IDs from a spreadsheet. Supports CSV, XLSX,
                XLS, and ODS. Only the custom name and membership ID are written — the Telegram ID
                and username are never modified, and empty cells leave the existing value untouched.
                Rows are matched on Telegram user ID; a username is only used to look up the ID when
                that cell is blank, since usernames can change.
              </p>
            </div>

            <div className="import-drop">
              <input
                ref={fileInputRef}
                id="member-import-file"
                type="file"
                className="import-file-input"
                accept={IMPORT_ACCEPT}
                onChange={(e) => void handleImportFile(e)}
              />
              <label htmlFor="member-import-file" className="import-drop-label">
                <strong>{importFileName ?? 'Choose a file'}</strong>
                <span className="muted">CSV, XLSX, XLS or ODS</span>
              </label>
            </div>

            {importError && (
              <p className="error import-note">{importError}</p>
            )}

            {importRows.length > 0 && (
              <div className="import-preview">
                <div className="import-summary">
                  <span className="status-chip status-on">{importRows.length} ready</span>
                  {importSkipped.length > 0 && (
                    <span className="status-chip status-warn">
                      {importSkipped.length} skipped
                    </span>
                  )}
                </div>

                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Telegram ID</th>
                        <th>Username</th>
                        <th>Custom name</th>
                        <th>Membership ID</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importRows.slice(0, 5).map((r) => (
                        <tr key={r.row}>
                          <td data-label="Telegram ID" className="mono">
                            {r.telegram_user_id || <span className="muted">—</span>}
                          </td>
                          <td data-label="Username">
                            {r.username ? `@${r.username}` : <span className="muted">—</span>}
                          </td>
                          <td data-label="Custom name">
                            {r.custom_name || <span className="muted">—</span>}
                          </td>
                          <td data-label="Membership ID">
                            {r.membership_id || <span className="muted">—</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {importRows.length > 5 && (
                  <p className="muted import-note">
                    Showing the first 5 of {importRows.length} rows.
                  </p>
                )}

                {importSkipped.length > 0 && (
                  <ul className="import-skipped muted">
                    {importSkipped.slice(0, 5).map((s) => (
                      <li key={s.row}>
                        Row {s.row}: {s.reason}
                      </li>
                    ))}
                    {importSkipped.length > 5 && (
                      <li>…and {importSkipped.length - 5} more.</li>
                    )}
                  </ul>
                )}
              </div>
            )}

            <div className="settings-panel-actions button-row">
              <button
                type="button"
                disabled={importing || importRows.length === 0}
                onClick={() => void runImport()}
              >
                {importing ? 'Importing…' : `Import ${importRows.length || ''} members`.trim()}
              </button>
              <button type="button" className="secondary" onClick={downloadMemberTemplate}>
                Download example CSV
              </button>
              {(importFileName || importError) && (
                <button type="button" className="danger" onClick={resetImport}>
                  Clear
                </button>
              )}
            </div>
          </section>

          <section className="settings-panel">
            <div className="settings-panel-head">
              <div className="settings-panel-title-row">
                <h2>Members</h2>
                <span className="status-chip status-neutral">{members.length} total</span>
              </div>
              <p className="muted">
                Assign a membership ID and an optional custom name to each Telegram user. Typed
                manually by the admin.
              </p>
            </div>

            <label className="field field-search">
              <span className="field-label">Search</span>
              <input
                value={memberQuery}
                onChange={(e) => setMemberQuery(e.target.value)}
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
                  {filteredMembers.length === 0 && (
                    <tr>
                      <td colSpan={5} className="muted empty-cell">
                        {members.length === 0
                          ? 'No members yet. They appear when people message in tracked groups.'
                          : 'No members match your search.'}
                      </td>
                    </tr>
                  )}
                  {filteredMembers.map((m) => {
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
      )}
    </div>
  )
}
