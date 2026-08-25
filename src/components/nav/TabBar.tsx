import type { Screen } from '../../store/types'
import { Fab } from './Fab'

const TABS: { id: Screen; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'trends', label: 'Trends' },
  { id: 'history', label: 'History' },
  { id: 'setup', label: 'Setup' },
]

interface TabBarProps {
  active: Screen
  onSelect: (screen: Screen) => void
  onFab: () => void
}

export function TabBar({ active, onSelect, onFab }: TabBarProps) {
  return (
    <div
      style={{
        position: 'sticky',
        bottom: 0,
        left: 0,
        right: 0,
        background: 'linear-gradient(to bottom, rgba(11,12,11,0) 0%, #0b0c0b 34%)',
        paddingTop: 24,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 6px 30px' }}>
        {TABS.map((tab) => {
          const isActive = tab.id === active
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onSelect(tab.id)}
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 6,
                minHeight: 44,
                justifyContent: 'center',
                cursor: 'pointer',
              }}
            >
              <span
                style={{
                  width: 16,
                  height: 3,
                  borderRadius: 999,
                  background: isActive ? 'var(--lime)' : 'transparent',
                }}
              />
              <span
                style={{
                  font: '600 10px/1 "Barlow Condensed", sans-serif',
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                  color: isActive ? 'var(--text-primary)' : 'var(--text-dim)',
                }}
              >
                {tab.label}
              </span>
            </button>
          )
        })}
        <Fab onClick={onFab} />
      </div>
    </div>
  )
}
