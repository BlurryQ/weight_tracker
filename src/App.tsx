import { useEffect, useRef } from 'react'
import { AuthGate } from './data/AuthGate'
import { AppProvider, useApp } from './store/AppContext'
import { TabBar } from './components/nav/TabBar'
import { Toast } from './components/nav/Toast'
import { EntrySheet } from './components/entry/EntrySheet'
import { Today } from './screens/Today'
import { Trends } from './screens/Trends'
import { History } from './screens/History'
import { Setup } from './screens/Setup'
import { today as todayIso } from './lib/dates'

function Shell() {
  const { state, dispatch } = useApp()
  const scrollRef = useRef<HTMLDivElement>(null)

  // Every screen shares one scroll container (so the tab bar can sit inside it and scroll out
  // content from underneath its gradient, per the design) — but that means switching tabs
  // doesn't naturally reset scroll position. Left scrolled from a taller screen, a shorter one
  // renders with its top pushed out of view above the visible area. Reset on every tab switch.
  useEffect(() => {
    scrollRef.current?.scrollTo(0, 0)
  }, [state.screen])

  return (
    <>
      <div
        ref={scrollRef}
        className="hide-scrollbar"
        style={{ height: '100%', overflowY: 'auto' }}
      >
        {/* minHeight: 100% + flex column, with the content area as the flexed child, so the tab
            bar still anchors to the bottom of the screen even when a screen's content is shorter
            than the viewport — position: sticky alone only pins while there's something to
            scroll, so short content otherwise leaves the bar floating above a blank gap. */}
        <div style={{ minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
          <div style={{ flex: '1 0 auto', paddingTop: 'max(20px, env(safe-area-inset-top))' }}>
            {state.screen === 'today' && <Today />}
            {state.screen === 'trends' && <Trends />}
            {state.screen === 'history' && <History />}
            {state.screen === 'setup' && <Setup />}
          </div>

          <Toast message={state.toast} onDismiss={() => dispatch({ type: 'CLEAR_TOAST' })} />

          <TabBar
            active={state.screen}
            onSelect={(screen) => dispatch({ type: 'SET_SCREEN', screen })}
            onFab={() => dispatch({ type: 'OPEN_SHEET', sheet: todayIso() })}
          />
        </div>
      </div>

      <EntrySheet />
    </>
  )
}

function App() {
  return (
    <AuthGate>
      <AppProvider>
        <Shell />
      </AppProvider>
    </AuthGate>
  )
}

export default App
