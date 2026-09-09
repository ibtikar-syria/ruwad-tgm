import type { ReactNode } from 'react'

type Props = {
  message?: ReactNode
  error?: ReactNode
}

export function StatusBanner({ message, error }: Props) {
  if (!message && !error) return null
  return (
    <>
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
    </>
  )
}
