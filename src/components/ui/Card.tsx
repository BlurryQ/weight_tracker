import type { CSSProperties, ReactNode } from 'react'

export function Card({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div
      style={{
        borderRadius: 14,
        background: 'var(--surface)',
        ...style,
      }}
    >
      {children}
    </div>
  )
}
