import { addDays, mondayOf, today as todayIso } from '../lib/dates'
import { applyKeypadKey, toDisplay } from '../lib/format'
import type { NutritionEntry } from '../lib/energy'
import { dedupePhaseLog } from '../lib/math'
import type { AppState, PersistedState, Screen, SolveMode, TrendWindow, TrendWindowMode, Unit } from './types'
import type { PhaseName } from '../lib/math'

export type Action =
  | { type: 'SET_SCREEN'; screen: Screen }
  | { type: 'OPEN_SHEET'; sheet: string | 'target' }
  | { type: 'CLOSE_SHEET' }
  | { type: 'TAP_KEY'; key: string }
  | { type: 'SAVE_ENTRY'; date: string; lbs: number }
  | { type: 'DELETE_ENTRY'; date: string }
  | { type: 'MERGE_NUTRITION'; entries: NutritionEntry[] }
  | { type: 'SET_PHASE'; phase: PhaseName }
  | { type: 'RESTART_PHASE' }
  | { type: 'SET_PHASE_WEEK'; week: number }
  /** Deload/Maintain as a one-week event, not a phase change — appends to phaseLog only,
   * leaves phase/phaseStart untouched. See SET_PHASE for the "this is now my real phase" path. */
  | { type: 'LOG_FOLDED_WEEK'; name: 'Maintain' | 'Deload' }
  /** Staging step for a real phase change (Setup's Cut/Bulk/Maintain grid) — tapping a card no
   * longer applies SET_PHASE immediately; it stages a pending selection that COMMIT_PHASE_CHANGE
   * applies, so a mistap doesn't silently start a bulk. */
  | { type: 'STAGE_PHASE'; phase: PhaseName }
  | { type: 'COMMIT_PHASE_CHANGE' }
  | { type: 'UNDO_PHASE_CHANGE' }
  | { type: 'SET_WEEKLY_TARGET'; value: number }
  | { type: 'SET_UNIT'; unit: Unit }
  | { type: 'SET_TREND_WINDOW'; window: TrendWindow }
  | { type: 'SET_TREND_WINDOW_MODE'; mode: TrendWindowMode }
  | { type: 'TOGGLE_WEEK'; monday: string }
  | { type: 'SET_SOLVE_MODE'; mode: SolveMode }
  | { type: 'SET_TARGET_LBS'; value: number }
  | { type: 'SAVE_TARGET'; value: number }
  | { type: 'SET_TARGET_WEEKS'; value: number }
  | { type: 'SHOW_TOAST'; message: string }
  | { type: 'CLEAR_TOAST' }
  | { type: 'HYDRATE'; state: Partial<PersistedState> }
  | { type: 'SET_SYNC_FAILED'; failed: boolean }

function withPhaseLogAppend(phaseLog: AppState['phaseLog'], start: string, name: PhaseName) {
  return dedupePhaseLog([...phaseLog, { start, name }])
}

/** The actual "make this the real phase" transition, shared by SET_PHASE (direct, still used as
 * the underlying primitive) and COMMIT_PHASE_CHANGE (the staged path Setup's grid now uses). */
function applyPhaseChange(state: AppState, phase: PhaseName): Pick<AppState, 'phase' | 'phaseStart' | 'phaseLog'> {
  const start = todayIso()
  return { phase, phaseStart: start, phaseLog: withPhaseLogAppend(state.phaseLog, start, phase) }
}

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'SET_SCREEN':
      return { ...state, screen: action.screen }

    case 'OPEN_SHEET': {
      let prefill = ''
      if (action.sheet === 'target') {
        prefill = toDisplay(state.targetLbs, state.unit).toFixed(1)
      } else {
        const existing = state.entries.find((e) => e.date === action.sheet)
        if (existing) prefill = toDisplay(existing.lbs, state.unit).toFixed(1)
      }
      return { ...state, sheet: action.sheet, keypadValue: prefill, keypadPristine: prefill !== '' }
    }

    case 'CLOSE_SHEET':
      return { ...state, sheet: null, keypadValue: '', keypadPristine: false }

    case 'TAP_KEY': {
      // First tap on a pristine (prefilled) value overtypes it instead of appending — same as a
      // pre-selected text field: any keystroke, including backspace, starts from empty.
      const base = state.keypadPristine ? '' : state.keypadValue
      return { ...state, keypadValue: applyKeypadKey(base, action.key), keypadPristine: false }
    }

    case 'SAVE_ENTRY': {
      const rest = state.entries.filter((e) => e.date !== action.date)
      return {
        ...state,
        entries: [...rest, { date: action.date, lbs: action.lbs }].sort((a, b) =>
          a.date < b.date ? -1 : 1,
        ),
        sheet: null,
        keypadValue: '',
        keypadPristine: false,
      }
    }

    case 'DELETE_ENTRY':
      return {
        ...state,
        entries: state.entries.filter((e) => e.date !== action.date),
        sheet: null,
        keypadValue: '',
        keypadPristine: false,
      }

    case 'MERGE_NUTRITION': {
      // Upsert by date, incoming wins. Callers pass only days that actually changed, so an
      // empty list is a no-op (avoids a pointless state churn on every app resume).
      if (!action.entries.length) return state
      const byDate = new Map(state.nutrition.map((n) => [n.date, n]))
      for (const n of action.entries) byDate.set(n.date, n)
      return {
        ...state,
        nutrition: [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1)),
      }
    }

    case 'SET_PHASE': {
      // Tapping the already-selected phase card is a no-op, not a reset — otherwise re-opening
      // Setup and tapping your current phase (e.g. just to look at it) silently zeroes the week
      // counter back to 1.
      if (action.phase === state.phase) return state
      return { ...state, ...applyPhaseChange(state, action.phase) }
    }

    case 'RESTART_PHASE': {
      const start = todayIso()
      return {
        ...state,
        phaseStart: start,
        phaseLog: withPhaseLogAppend(state.phaseLog, start, state.phase),
      }
    }

    case 'SET_PHASE_WEEK': {
      // Lets the week counter be corrected directly (e.g. importing an in-progress phase)
      // without touching phaseLog — the chart's Cut/Bulk bands and History's phase tags key off
      // phaseLog, not phaseStart, so this only affects the week-counter display.
      const week = Math.max(1, Math.round(action.week))
      const phaseStart = addDays(mondayOf(todayIso()), -(week - 1) * 7)
      return { ...state, phaseStart }
    }

    case 'LOG_FOLDED_WEEK':
      return { ...state, phaseLog: withPhaseLogAppend(state.phaseLog, todayIso(), action.name) }

    case 'STAGE_PHASE': {
      // Tapping the already-committed phase no-ops (clears any stray staging rather than
      // starting one — you're already on it). Tapping the already-staged phase again cancels
      // the staging. Anything else replaces whatever was staged.
      if (action.phase === state.phase || action.phase === state.pendingPhase) {
        return state.pendingPhase === null ? state : { ...state, pendingPhase: null }
      }
      return { ...state, pendingPhase: action.phase }
    }

    case 'COMMIT_PHASE_CHANGE': {
      if (!state.pendingPhase || state.pendingPhase === state.phase) return { ...state, pendingPhase: null }
      return {
        ...state,
        ...applyPhaseChange(state, state.pendingPhase),
        pendingPhase: null,
        // Stash exactly enough of the pre-change state for UNDO_PHASE_CHANGE to restore it —
        // the undo toast's window is how long this stays available (CLEAR_TOAST drops it too).
        phaseUndo: { phase: state.phase, phaseStart: state.phaseStart, phaseLog: state.phaseLog },
      }
    }

    case 'UNDO_PHASE_CHANGE': {
      if (!state.phaseUndo) return state
      return {
        ...state,
        phase: state.phaseUndo.phase,
        phaseStart: state.phaseUndo.phaseStart,
        phaseLog: state.phaseUndo.phaseLog,
        phaseUndo: null,
        toast: null,
      }
    }

    case 'SET_WEEKLY_TARGET':
      return { ...state, weeklyTarget: action.value }

    case 'SET_UNIT':
      return { ...state, unit: action.unit }

    case 'SET_TREND_WINDOW':
      return { ...state, trendWindow: action.window }

    case 'SET_TREND_WINDOW_MODE':
      return { ...state, trendWindowMode: action.mode }

    case 'TOGGLE_WEEK':
      return { ...state, openWeek: state.openWeek === action.monday ? null : action.monday }

    case 'SET_SOLVE_MODE':
      return { ...state, solveMode: action.mode }

    case 'SET_TARGET_LBS':
      return { ...state, targetLbs: action.value }

    case 'SAVE_TARGET':
      return { ...state, targetLbs: action.value, sheet: null, keypadValue: '', keypadPristine: false }

    case 'SET_TARGET_WEEKS':
      return { ...state, targetWeeks: action.value }

    case 'SHOW_TOAST':
      return { ...state, toast: action.message }

    case 'CLEAR_TOAST':
      // Dropping phaseUndo here too — undo is only ever offered for the toast window it arrived
      // with, not indefinitely after it's gone from screen.
      return { ...state, toast: null, phaseUndo: null }

    case 'HYDRATE':
      return { ...state, ...action.state, phaseLog: dedupePhaseLog(action.state.phaseLog ?? state.phaseLog), hydrated: true }

    case 'SET_SYNC_FAILED':
      return { ...state, syncFailed: action.failed }

    default:
      return state
  }
}
