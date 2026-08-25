const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫']

export function Keypad({ onTap }: { onTap: (key: string) => void }) {
  return (
    <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
      {KEYS.map((key) => (
        <button
          key={key}
          type="button"
          onClick={() => onTap(key)}
          style={{
            borderRadius: 14,
            background: 'var(--raised)',
            textAlign: 'center',
            padding: '15px 0',
            font: '700 21px/1 "Barlow Condensed", sans-serif',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
          }}
        >
          {key}
        </button>
      ))}
    </div>
  )
}
