import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, type ReactNode } from 'react'
import { drainQueue, pullRemote, startAutoSync } from '../data/sync'
import { loadSnapshot, saveSnapshot } from '../data/localCache'
import { enqueue, type SettingsPayload } from '../data/queue'
import { reducer, type Action } from './reducer'
import { initialState, type AppState } from './types'

function settingsFrom(state: AppState): SettingsPayload {
  return {
    phase: state.phase,
    phaseStart: state.phaseStart,
    weeklyTarget: state.weeklyTarget,
    unit: state.unit,
    trendWindow: state.trendWindow,
    trendHorizon: state.trendHorizon,
    solveMode: state.solveMode,
    targetLbs: state.targetLbs,
    targetWeeks: state.targetWeeks,
  }
}

const SETTINGS_ACTION_TYPES = new Set<Action['type']>([
  'SET_WEEKLY_TARGET',
  'SET_UNIT',
  'SET_TREND_WINDOW',
  'SET_TREND_HORIZON',
  'SET_SOLVE_MODE',
  'SET_TARGET_LBS',
  'SAVE_TARGET',
  'SET_TARGET_WEEKS',
  'SET_PHASE_WEEK',
])

/** Queues the sync side effects implied by one action, using the action's own payload for
 * entry/phase writes (so we never need to diff state) and the freshly-reduced `next` state for
 * whole-settings writes. Every persisted-state action also re-saves the local snapshot, keeping
 * the cache authoritative for instant offline reads on the next boot. */
function queueSideEffects(action: Action, next: AppState) {
  switch (action.type) {
    case 'SAVE_ENTRY':
      enqueue({ op: 'upsert_entry', payload: { date: action.date, lbs: action.lbs } })
      break
    case 'DELETE_ENTRY':
      enqueue({ op: 'delete_entry', payload: { date: action.date } })
      break
    case 'SET_PHASE':
    case 'RESTART_PHASE': {
      const last = next.phaseLog[next.phaseLog.length - 1]
      if (last) enqueue({ op: 'upsert_phase', payload: { start: last.start, name: last.name } })
      enqueue({ op: 'upsert_settings', payload: settingsFrom(next) })
      break
    }
    default:
      if (SETTINGS_ACTION_TYPES.has(action.type)) {
        enqueue({ op: 'upsert_settings', payload: settingsFrom(next) })
      }
  }
  saveSnapshot(next)
}

interface AppContextValue {
  state: AppState
  dispatch: (action: Action) => void
}

const AppContext = createContext<AppContextValue | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, reactDispatch] = useReducer(reducer, undefined, () => {
    const base = initialState()
    const cached = loadSnapshot()
    // A genuinely fresh install boots empty — no auto-seeded history. (This used to default to
    // one person's real weigh-in data via a "Reset to the CSV import" feature; removed entirely
    // since that data had no business shipping in every install of this codebase.)
    return cached ? { ...base, ...cached } : base
  })

  const stateRef = useRef(state)
  useEffect(() => {
    stateRef.current = state
  }, [state])

  const dispatch = useCallback((action: Action) => {
    const next = reducer(stateRef.current, action)
    stateRef.current = next
    reactDispatch(action)
    queueSideEffects(action, next)
    if (navigator.onLine) {
      void drainQueue((failed) => reactDispatch({ type: 'SET_SYNC_FAILED', failed }))
    }
  }, [])

  // Boot: pull the remote snapshot once (if configured/signed in) and overwrite local state —
  // single-user app, so last-fetch-wins is sufficient. Falls back to whatever the local cache
  // (or seed data) already hydrated synchronously above.
  useEffect(() => {
    let cancelled = false
    void pullRemote().then((remote) => {
      if (cancelled || !remote) return
      reactDispatch({
        type: 'HYDRATE',
        state: {
          entries: remote.entries,
          phaseLog: remote.phaseLog,
          ...(remote.settings ?? {}),
        },
      })
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    return startAutoSync((failed) => reactDispatch({ type: 'SET_SYNC_FAILED', failed }))
  }, [])

  const value = useMemo(() => ({ state, dispatch }), [state, dispatch])

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
