import { useEffect } from 'react'

interface ToastProps {
  message: string | null
  onDismiss: () => void
  /** When present, the toast grows an "undo" affix — tappable, calls this then dismisses.
   * Absent for every ordinary toast; only a caller that stashed something undoable passes it. */
  onUndo?: () => void
}

export function Toast({ message, onDismiss, onUndo }: ToastProps) {
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
          // The row above stays click-through (pointerEvents: none) so the toast never blocks
          // taps elsewhere; the pill itself opts back in only when there's an undo to tap.
          pointerEvents: onUndo ? 'auto' : 'none',
        }}
      >
        {message}
        {onUndo && (
          <>
            {' · '}
            <button
              type="button"
              onClick={() => {
                onUndo()
                onDismiss()
              }}
              style={{
                cursor: 'pointer',
                font: 'inherit',
                fontWeight: 700,
                color: 'var(--accent)',
              }}
            >
              undo
            </button>
          </>
        )}
      </span>
    </div>
  )
}
