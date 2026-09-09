import { useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../api'
import { StatusBanner } from '../../components/StatusBanner'
import { useI18n, type I18nValue } from '../../i18n/context'
import {
  downloadMemberTemplate,
  IMPORT_ACCEPT,
  MemberFileError,
  parseMemberFile,
  type MemberImportRow,
  type SkipReason,
  type SkippedRow,
} from '../../importMembers'

const PREVIEW_LIMIT = 5

function reasonText(reason: SkipReason, t: I18nValue['t']): string {
  switch (reason.code) {
    case 'invalidId':
      return t('import.reasonInvalidId', { id: reason.id })
    case 'noValues':
      return t('import.reasonNoValues')
    default:
      return t('import.reasonMissingId')
  }
}

export function ImportSettings() {
  const { t } = useI18n()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [rows, setRows] = useState<MemberImportRow[]>([])
  const [skipped, setSkipped] = useState<SkippedRow[]>([])
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
        setParseError(t('import.noRows'))
      }
    } catch (err) {
      setRows([])
      setSkipped([])
      if (err instanceof MemberFileError) {
        setParseError(
          err.code === 'noSheets'
            ? t('import.errorNoSheets')
            : err.code === 'noIdColumn'
              ? t('import.errorNoIdColumn')
              : t('import.errorNoValueColumn'),
        )
      } else {
        setParseError(t('import.readFailed'))
      }
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
      const parts = [
        t('import.updated', { count: res.updated }),
        t('import.created', { count: res.created }),
      ]
      if (res.skipped.length > 0) {
        parts.push(t('import.skippedCount', { count: res.skipped.length }))
      }
      setMessage(
        <>
          {t('import.finished', { summary: parts.join(t('common.listSeparator')) })}{' '}
          {t('import.review')}{' '}
          <Link to="../members">{t('import.membersTab')}</Link>.
        </>,
      )
      reset()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('import.failed'))
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="settings-stack">
      <StatusBanner message={message} error={error} />

      <section className="settings-panel">
        <div className="settings-panel-head">
          <h2>{t('import.heading')}</h2>
          <p className="muted">{t('import.desc')}</p>
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
            <strong>{fileName ?? t('import.chooseFile')}</strong>
            <span className="muted">{t('import.fileTypes')}</span>
          </label>
        </div>

        {parseError && <p className="error import-note">{parseError}</p>}

        {rows.length > 0 && (
          <div className="import-preview">
            <div className="import-summary">
              <span className="status-chip status-on">
                {t('import.ready', { count: rows.length })}
              </span>
              {skipped.length > 0 && (
                <span className="status-chip status-warn">
                  {t('import.skipped', { count: skipped.length })}
                </span>
              )}
            </div>

            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t('column.telegramId')}</th>
                    <th>{t('column.username')}</th>
                    <th>{t('column.customName')}</th>
                    <th>{t('column.membershipId')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, PREVIEW_LIMIT).map((r) => (
                    <tr key={r.row}>
                      <td data-label={t('column.telegramId')} className="mono">
                        {r.telegram_user_id || <span className="muted">{t('common.empty')}</span>}
                      </td>
                      <td data-label={t('column.username')}>
                        {r.username ? `@${r.username}` : <span className="muted">{t('common.empty')}</span>}
                      </td>
                      <td data-label={t('column.customName')}>
                        {r.custom_name || <span className="muted">{t('common.empty')}</span>}
                      </td>
                      <td data-label={t('column.membershipId')}>
                        {r.membership_id || <span className="muted">{t('common.empty')}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {rows.length > PREVIEW_LIMIT && (
              <p className="muted import-note">
                {t('import.showingFirst', { shown: PREVIEW_LIMIT, total: rows.length })}
              </p>
            )}

            {skipped.length > 0 && (
              <ul className="import-skipped muted">
                {skipped.slice(0, PREVIEW_LIMIT).map((s) => (
                  <li key={s.row}>
                    {t('import.rowReason', { row: s.row, reason: reasonText(s.reason, t) })}
                  </li>
                ))}
                {skipped.length > PREVIEW_LIMIT && (
                  <li>{t('import.andMore', { count: skipped.length - PREVIEW_LIMIT })}</li>
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
            {importing
              ? t('import.running')
              : rows.length > 0
                ? t('import.run', { count: rows.length })
                : t('import.runEmpty')}
          </button>
          <button type="button" className="secondary" onClick={() => downloadMemberTemplate(t)}>
            {t('import.downloadExample')}
          </button>
          {(fileName || parseError) && (
            <button type="button" className="danger" onClick={reset}>
              {t('common.clear')}
            </button>
          )}
        </div>
      </section>
    </div>
  )
}
