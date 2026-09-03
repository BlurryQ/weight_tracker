import type { NutritionEntry } from '../lib/energy'
import type { Entry, PhaseLogEntry, PhaseName, TrendWindowMode } from '../lib/math'

export type Screen = 'today' | 'trends' | 'history' | 'setup'
export type Unit = 'lb' | 'kg'
export type SolveMode = 'weight' | 'date'
export type TrendWindow = 8 | 13 | 26 | 99
export type { TrendWindowMode }

/** State persisted to local cache and, once synced, to Supabase. */
export interface PersistedState {
  entries: Entry[]
  /** Daily calories-consumed totals from Health Connect (MyFitnessPal writes them there).
   * Read-through cache of the `daily_nutrition` table; empty on platforms without Health
   * Connect. */
  nutrition: NutritionEntry[]
  phase: PhaseName
  phaseStart: string
  phaseLog: PhaseLogEntry[]
  weeklyTarget: number
  unit: Unit
  trendWindow: TrendWindow
  /** 'weeks' uses `trendWindow` as-is; 'phaseStart'/'lastDeload' scope the chart's window to a
   * phase-log anchor instead (see `phaseAnchoredShowN`) — `trendWindow` is ignored in those. */
  trendWindowMode: TrendWindowMode
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
  /** A phase tapped on Setup's grid but not yet committed — STAGE_PHASE sets this,
   * COMMIT_PHASE_CHANGE applies it. Lets a mistap be caught before it starts a real phase. */
  pendingPhase: PhaseName | null
  /** The phase/phaseStart/phaseLog a COMMIT_PHASE_CHANGE just replaced, kept just long enough
   * for UNDO_PHASE_CHANGE to restore it (cleared together with the toast that offers it). */
  phaseUndo: { phase: PhaseName; phaseStart: string; phaseLog: PhaseLogEntry[] } | null
}

export type AppState = PersistedState & UiState

export const PERSISTED_KEYS: (keyof PersistedState)[] = [
  'entries',
  'nutrition',
  'phase',
  'phaseStart',
  'phaseLog',
  'weeklyTarget',
  'unit',
  'trendWindow',
  'trendWindowMode',
  'solveMode',
  'targetLbs',
  'targetWeeks',
]

export function initialState(): AppState {
  const today = new Date().toISOString().slice(0, 10)
  return {
    entries: [],
    nutrition: [],
    phase: 'Cut',
    phaseStart: today,
    phaseLog: [{ start: today, name: 'Cut' }],
    weeklyTarget: -1.0,
    unit: 'lb',
    trendWindow: 26,
    trendWindowMode: 'weeks',
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
    pendingPhase: null,
    phaseUndo: null,
  }
}
