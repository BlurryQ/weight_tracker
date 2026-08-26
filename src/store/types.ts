import type { Entry, PhaseLogEntry, PhaseName } from '../lib/math'

export type Screen = 'today' | 'trends' | 'history' | 'setup'
export type Unit = 'lb' | 'kg'
export type SolveMode = 'weight' | 'date'
export type TrendWindow = 8 | 13 | 26 | 99
export type TrendHorizon = 4 | 6 | 12

/** State persisted to local cache and, once synced, to Supabase. */
export interface PersistedState {
  entries: Entry[]
  phase: PhaseName
  phaseStart: string
  phaseLog: PhaseLogEntry[]
  weeklyTarget: number
  unit: Unit
  trendWindow: TrendWindow
  trendHorizon: TrendHorizon
  solveMode: SolveMode
  targetLbs: number
  targetWeeks: number
}

/** UI-only state — never persisted, never synced. */
export interface UiState {
  screen: Screen
  sheet: string | 'target' | null
  keypadValue: string
  /** True right after opening the sheet on a day/target that already has a value — the first
   * keypad tap overtypes it instead of appending, like a pre-selected text field. */
  keypadPristine: boolean
  openWeek: string | null
  toast: string | null
  /** Set when the last sync attempt failed and writes remain queued. */
  syncFailed: boolean
  /** True once the initial local/remote hydration has completed. */
  hydrated: boolean
}

export type AppState = PersistedState & UiState

export const PERSISTED_KEYS: (keyof PersistedState)[] = [
  'entries',
  'phase',
  'phaseStart',
  'phaseLog',
  'weeklyTarget',
  'unit',
  'trendWindow',
  'trendHorizon',
  'solveMode',
  'targetLbs',
  'targetWeeks',
]

export function initialState(): AppState {
  const today = new Date().toISOString().slice(0, 10)
  return {
    entries: [],
    phase: 'Cut',
    phaseStart: today,
    phaseLog: [{ start: today, name: 'Cut' }],
    weeklyTarget: -1.0,
    unit: 'lb',
    trendWindow: 26,
    trendHorizon: 6,
    solveMode: 'weight',
    targetLbs: 175,
    targetWeeks: 6,
    screen: 'today',
    sheet: null,
    keypadValue: '',
    keypadPristine: false,
    openWeek: null,
    toast: null,
    syncFailed: false,
    hydrated: false,
  }
}
