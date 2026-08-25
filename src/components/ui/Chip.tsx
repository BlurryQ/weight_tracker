interface ChipProps {
  dotColor: string
  textColor: string
  bg: string
  border: string
  label: string
  onClick?: () => void
}

/** The phase chip on the Today screen ('Cut · week 4'), tappable to navigate to Setup. */
export function Chip({ dotColor, textColor, bg, border, label, onClick }: ChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '5px 11px',
        borderRadius: 999,
        background: bg,
        border: `1px solid ${border}`,
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: dotColor, display: 'inline-block' }} />
      <span
        style={{
          font: '600 10.5px/1 "Barlow Condensed", sans-serif',
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: textColor,
        }}
      >
        {label}
      </span>
    </button>
  )
}
