export function Fab({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Log today's weight"
      style={{
        width: 54,
        height: 54,
        borderRadius: '50%',
        background: 'var(--lime)',
        boxShadow: '0 6px 18px oklch(0.82 0.17 128 / .3)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        flexShrink: 0,
      }}
    >
      <svg width="20" height="20" viewBox="0 0 20 20">
        <rect x="9" y="2" width="2" height="16" rx="1" fill="#0b0c0b" />
        <rect x="2" y="9" width="16" height="2" rx="1" fill="#0b0c0b" />
      </svg>
    </button>
  )
}
