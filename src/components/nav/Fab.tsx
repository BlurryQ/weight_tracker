export function Fab({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Log today's weight"
      className="accent-el"
      style={{
        width: 54,
        height: 54,
        borderRadius: '50%',
        background: 'var(--accent)',
        boxShadow: '0 6px 18px var(--accent-glow)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        flexShrink: 0,
      }}
    >
      <svg width="20" height="20" viewBox="0 0 20 20">
        <rect x="9" y="2" width="2" height="16" rx="1" fill="var(--on-accent)" />
        <rect x="2" y="9" width="16" height="2" rx="1" fill="var(--on-accent)" />
      </svg>
    </button>
  )
}
