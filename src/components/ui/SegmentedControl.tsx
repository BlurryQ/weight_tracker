interface SegmentedOption<T extends string | number> {
  value: T
  label: string
}

interface SegmentedControlProps<T extends string | number> {
  options: SegmentedOption<T>[]
  value: T
  onChange: (value: T) => void
  /** 'lg' matches the scale of a standalone, prominent control (e.g. the Trends window picker);
   * default 'sm' is the original compact scale used everywhere else. */
  size?: 'sm' | 'lg'
}

const SIZES = {
  sm: { padding: '6px 12px', font: '600 10px/1 "Barlow Condensed", sans-serif' },
  lg: { padding: '9px 14px', font: '600 11.5px/1 "Barlow Condensed", sans-serif' },
}

/** The pill-track segmented control used for unit, trend window, trend horizon, and Reach mode. */
export function SegmentedControl<T extends string | number>({ options, value, onChange, size = 'sm' }: SegmentedControlProps<T>) {
  const scale = SIZES[size]
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
              padding: scale.padding,
              borderRadius: 999,
              background: active ? 'var(--accent)' : 'transparent',
              color: active ? 'var(--on-accent)' : 'var(--text-dim)',
              font: scale.font,
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
