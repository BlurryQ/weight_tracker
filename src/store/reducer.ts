import { addDays, mondayOf, today as todayIso } from '../lib/dates'
import { applyKeypadKey, toDisplay } from '../lib/format'
import { dedupePhaseLog } from '../lib/math'
import type { AppState, PersistedState, Screen, SolveMode, TrendHorizon, TrendWindow, Unit } from './types'
import type { PhaseName } from '../lib/math'

export type Action =
  | { type: 'SET_SCREEN'; screen: Screen }
  | { type: 'OPEN_SHEET'; sheet: string | 'target' }
  | { type: 'CLOSE_SHEET' }
  | { type: 'TAP_KEY'; key: string }
  | { type: 'SAVE_ENTRY'; date: string; lbs: number }
  | { type: 'DELETE_ENTRY'; date: string }
  | { type: 'SET_PHASE'; phase: PhaseName }
  | { type: 'RESTART_PHASE' }
  | { type: 'SET_PHASE_WEEK'; week: number }
  | { type: 'SET_WEEKLY_TARGET'; value: number }
  | { type: 'SET_UNIT'; unit: Unit }
  | { type: 'SET_TREND_WINDOW'; window: TrendWindow }
  | { type: 'SET_TREND_HORIZON'; horizon: TrendHorizon }
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

    case 'SET_PHASE': {
      // Tapping the already-selected phase card is a no-op, not a reset — otherwise re-opening
      // Setup and tapping your current phase (e.g. just to look at it) silently zeroes the week
      // counter back to 1.
      if (action.phase === state.phase) return state
      const start = todayIso()
      return {
        ...state,
        phase: action.phase,
        phaseStart: start,
        phaseLog: withPhaseLogAppend(state.phaseLog, start, action.phase),
      }
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

    case 'SET_WEEKLY_TARGET':
      return { ...state, weeklyTarget: action.value }

    case 'SET_UNIT':
      return { ...state, unit: action.unit }

    case 'SET_TREND_WINDOW':
      return { ...state, trendWindow: action.window }

    case 'SET_TREND_HORIZON':
      return { ...state, trendHorizon: action.horizon }

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
      return { ...state, toast: null }

    case 'HYDRATE':
      return { ...state, ...action.state, phaseLog: dedupePhaseLog(action.state.phaseLog ?? state.phaseLog), hydrated: true }

    case 'SET_SYNC_FAILED':
      return { ...state, syncFailed: action.failed }

    default:
      return state
  }
}
