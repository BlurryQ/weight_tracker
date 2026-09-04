import { useEffect, useLayoutEffect, useRef } from 'react'
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

  // The accent's phase — :root[data-phase] in index.css keys off this to swap (and cross-fade)
  // --accent and its derivatives. useLayoutEffect, not useEffect, so a phase persisted from a
  // previous session is stamped before first paint rather than flashing the Cut/cyan default.
  // Deload is never a standing phase in this UI (it only ever arrives via LOG_FOLDED_WEEK, which
  // leaves state.phase untouched) but the type allows it — leave the attribute as it was rather
  // than guessing at a colour for it.
  useLayoutEffect(() => {
    const attr = state.phase === 'Cut' ? 'cut' : state.phase === 'Bulk' ? 'bulk' : state.phase === 'Maintain' ? 'maintain' : null
    if (attr) document.documentElement.dataset.phase = attr
  }, [state.phase])

  // The commit shimmer — a one-shot brightness sweep across .accent-el elements, staggered by
  // screen position, right after a phase change actually commits. phaseUndo going null -> an
  // object in the same tick as phase changing is exactly (and only) what COMMIT_PHASE_CHANGE
  // does (see reducer.ts); UNDO_PHASE_CHANGE changes phase back but clears phaseUndo, so it never
  // matches this and gets no shimmer, matching the brief.
  const prevPhaseRef = useRef(state.phase)
  const prevUndoRef = useRef(state.phaseUndo)
  useEffect(() => {
    const justCommitted =
      state.phase !== prevPhaseRef.current && state.phaseUndo !== null && prevUndoRef.current === null
    prevPhaseRef.current = state.phase
    prevUndoRef.current = state.phaseUndo
    if (!justCommitted) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const els = Array.from(document.querySelectorAll<HTMLElement>('.accent-el'))
    if (!els.length) return
    const pos = els.map((el) => {
      const r = el.getBoundingClientRect()
      return r.left + r.top
    })
    const min = Math.min(...pos)
    const max = Math.max(...pos)
    els.forEach((el, i) => {
      const d = max > min ? (pos[i] - min) / (max - min) : 0
      el.style.animationDelay = `${Math.round(d * 380)}ms`
      el.classList.remove('accent-shimmer')
      void el.offsetWidth // restart the animation if it's still mid-run from a rapid re-tap
      el.classList.add('accent-shimmer')
    })
    const t = setTimeout(() => {
      els.forEach((el) => {
        el.classList.remove('accent-shimmer')
        el.style.animationDelay = ''
      })
    }, 1200)
    return () => clearTimeout(t)
  }, [state.phase, state.phaseUndo])

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

          <Toast
            message={state.toast}
            onDismiss={() => dispatch({ type: 'CLEAR_TOAST' })}
            onUndo={state.phaseUndo ? () => dispatch({ type: 'UNDO_PHASE_CHANGE' }) : undefined}
          />

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
