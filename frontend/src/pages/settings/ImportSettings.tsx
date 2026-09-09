import { useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../api'
import { StatusBanner } from '../../components/StatusBanner'
import {
  downloadMemberTemplate,
  IMPORT_ACCEPT,
  parseMemberFile,
  type MemberImportRow,
} from '../../importMembers'

const PREVIEW_LIMIT = 5

export function ImportSettings() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [rows, setRows] = useState<MemberImportRow[]>([])
  const [skipped, setSkipped] = useState<{ row: number; reason: string }[]>([])
  const [parseError, setParseError] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [message, setMessage] = useState<ReactNode>(null)
  const [error, setError] = useState<string | null>(null)

  function reset() {
    setFileName(null)
    setRows([])
    setSkipped([])
    setParseError(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setMessage(null)
    setError(null)
    setParseError(null)
    setFileName(file.name)
    try {
      const parsed = await parseMemberFile(file)
      setRows(parsed.rows)
      setSkipped(parsed.skipped)
      if (parsed.rows.length === 0) {
        setParseError('No importable rows found in this file.')
      }
    } catch (err) {
      setRows([])
      setSkipped([])
      setParseError(err instanceof Error ? err.message : 'Could not read this file')
    }
  }

  async function runImport() {
    if (rows.length === 0) return
    setImporting(true)
    setMessage(null)
    setError(null)
    try {
      const res = await api.importMembers(
        rows.map((r) => ({
          telegram_user_id: r.telegram_user_id,
          username: r.username,
          custom_name: r.custom_name,
          membership_id: r.membership_id,
        })),
      )
      const parts = [`${res.updated} updated`, `${res.created} created`]
      if (res.skipped.length > 0) parts.push(`${res.skipped.length} skipped`)
      setMessage(
        <>
          Import finished: {parts.join(', ')}. Review them on the{' '}
          <Link to="../members">Members tab</Link>.
        </>,
      )
      reset()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="settings-stack">
      <StatusBanner message={message} error={error} />

      <section className="settings-panel">
        <div className="settings-panel-head">
          <h2>Import data</h2>
          <p className="muted">
            Bulk-assign custom names and membership IDs from a spreadsheet. Supports CSV, XLSX, XLS,
            and ODS. Only the custom name and membership ID are written — the Telegram ID and
            username are never modified, and empty cells leave the existing value untouched. Rows
            are matched on Telegram user ID; a username is only used to look up the ID when that
            cell is blank, since usernames can change.
          </p>
        </div>

        <div className="import-drop">
          <input
            ref={fileInputRef}
            id="member-import-file"
            type="file"
            className="import-file-input"
            accept={IMPORT_ACCEPT}
            onChange={(e) => void handleFile(e)}
          />
          <label htmlFor="member-import-file" className="import-drop-label">
            <strong>{fileName ?? 'Choose a file'}</strong>
            <span className="muted">CSV, XLSX, XLS or ODS</span>
          </label>
        </div>

        {parseError && <p className="error import-note">{parseError}</p>}

        {rows.length > 0 && (
          <div className="import-preview">
            <div className="import-summary">
              <span className="status-chip status-on">{rows.length} ready</span>
              {skipped.length > 0 && (
                <span className="status-chip status-warn">{skipped.length} skipped</span>
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
                  {rows.slice(0, PREVIEW_LIMIT).map((r) => (
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
            {rows.length > PREVIEW_LIMIT && (
              <p className="muted import-note">
                Showing the first {PREVIEW_LIMIT} of {rows.length} rows.
              </p>
            )}

            {skipped.length > 0 && (
              <ul className="import-skipped muted">
                {skipped.slice(0, PREVIEW_LIMIT).map((s) => (
                  <li key={s.row}>
                    Row {s.row}: {s.reason}
                  </li>
                ))}
                {skipped.length > PREVIEW_LIMIT && (
                  <li>…and {skipped.length - PREVIEW_LIMIT} more.</li>
                )}
              </ul>
            )}
          </div>
        )}

        <div className="settings-panel-actions button-row">
          <button
            type="button"
            disabled={importing || rows.length === 0}
            onClick={() => void runImport()}
          >
            {importing ? 'Importing…' : `Import ${rows.length || ''} members`.trim()}
          </button>
          <button type="button" className="secondary" onClick={downloadMemberTemplate}>
            Download example CSV
          </button>
          {(fileName || parseError) && (
            <button type="button" className="danger" onClick={reset}>
              Clear
            </button>
          )}
        </div>
      </section>
    </div>
  )
}
