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

  return (
    <>
      {/* Content and the sticky tab bar share one scroll container, per the design: the bar
          sticks to the bottom while content scrolls out from underneath its gradient fade.
          Splitting these into separate flex rows (content vs. a fixed footer) was a real bug. */}
      <div className="hide-scrollbar" style={{ height: '100%', overflowY: 'auto', paddingTop: 'max(20px, env(safe-area-inset-top))' }}>
        {state.screen === 'today' && <Today />}
        {state.screen === 'trends' && <Trends />}
        {state.screen === 'history' && <History />}
        {state.screen === 'setup' && <Setup />}

        <Toast message={state.toast} onDismiss={() => dispatch({ type: 'CLEAR_TOAST' })} />

        <TabBar
          active={state.screen}
          onSelect={(screen) => dispatch({ type: 'SET_SCREEN', screen })}
          onFab={() => dispatch({ type: 'OPEN_SHEET', sheet: todayIso() })}
        />
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
