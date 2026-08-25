import type { CSSProperties } from 'react'

interface StepperProps {
  onDecrement: () => void
  onIncrement: () => void
  size?: number
  disabled?: 'down' | 'up' | null
}

/** The − / + square stepper used for weekly target and weeks-to-target. */
export function Stepper({ onDecrement, onIncrement, size = 38, disabled = null }: StepperProps) {
  const btnStyle = (which: 'down' | 'up'): CSSProperties => ({
    width: size,
    height: size,
    borderRadius: size >= 42 ? 12 : 11,
    background: 'var(--raised)',
    color: disabled === which ? 'var(--text-disabled)' : 'var(--text-secondary)',
    font: '700 18px/1 "Barlow Condensed", sans-serif',
    cursor: disabled === which ? 'default' : 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  })

  return (
    <>
      <button type="button" onClick={onDecrement} disabled={disabled === 'down'} style={btnStyle('down')}>
        −
      </button>
      <button type="button" onClick={onIncrement} disabled={disabled === 'up'} style={btnStyle('up')}>
        +
      </button>
    </>
  )
}
