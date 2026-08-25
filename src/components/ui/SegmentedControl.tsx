interface SegmentedOption<T extends string | number> {
  value: T
  label: string
}

interface SegmentedControlProps<T extends string | number> {
  options: SegmentedOption<T>[]
  value: T
  onChange: (value: T) => void
}

/** The pill-track segmented control used for unit, trend window, trend horizon, and Reach mode. */
export function SegmentedControl<T extends string | number>({ options, value, onChange }: SegmentedControlProps<T>) {
  return (
    <div
      style={{
        display: 'flex',
        background: 'var(--bg)',
        borderRadius: 999,
        padding: 3,
        gap: 2,
      }}
    >
      {options.map((opt) => {
        const active = opt.value === value
        return (
          <button
            key={String(opt.value)}
            type="button"
            onClick={() => onChange(opt.value)}
            style={{
              flex: 1,
              padding: '6px 12px',
              borderRadius: 999,
              background: active ? 'var(--lime)' : 'transparent',
              color: active ? '#0b0c0b' : 'var(--text-dim)',
              font: '600 10px/1 "Barlow Condensed", sans-serif',
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
