import { useEffect } from 'react'

interface ToastProps {
  message: string | null
  onDismiss: () => void
}

export function Toast({ message, onDismiss }: ToastProps) {
  useEffect(() => {
    if (!message) return
    const t = setTimeout(onDismiss, 3000)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message])

  if (!message) return null

  return (
    <div
      style={{
        position: 'sticky',
        bottom: 92,
        display: 'flex',
        justifyContent: 'center',
        pointerEvents: 'none',
        zIndex: 100,
      }}
    >
      <span
        style={{
          font: '500 10.5px "IBM Plex Mono", monospace',
          color: 'var(--lime)',
          background: 'var(--surface)',
          padding: '8px 14px',
          borderRadius: 999,
        }}
      >
        {message}
      </span>
    </div>
  )
}
