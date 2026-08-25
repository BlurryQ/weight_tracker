import { today as todayIso } from '../lib/dates'
import { toDisplay } from '../lib/format'
import { dedupePhaseLog } from '../lib/math'
import type { AppState, PersistedState, Screen, SolveMode, TrendHorizon, TrendWindow, Unit } from './types'
import type { PhaseName } from '../lib/math'

export type Action =
  | { type: 'SET_SCREEN'; screen: Screen }
  | { type: 'OPEN_SHEET'; sheet: string | 'target' }
  | { type: 'CLOSE_SHEET' }
  | { type: 'SET_KEYPAD_VALUE'; value: string }
  | { type: 'SAVE_ENTRY'; date: string; lbs: number }
  | { type: 'DELETE_ENTRY'; date: string }
  | { type: 'SET_PHASE'; phase: PhaseName }
  | { type: 'RESTART_PHASE' }
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
  | { type: 'RESET_TO_IMPORT'; entries: PersistedState['entries'] }

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
      return { ...state, sheet: action.sheet, keypadValue: prefill }
    }

    case 'CLOSE_SHEET':
      return { ...state, sheet: null, keypadValue: '' }

    case 'SET_KEYPAD_VALUE':
      return { ...state, keypadValue: action.value }

    case 'SAVE_ENTRY': {
      const rest = state.entries.filter((e) => e.date !== action.date)
      return {
        ...state,
        entries: [...rest, { date: action.date, lbs: action.lbs }].sort((a, b) =>
          a.date < b.date ? -1 : 1,
        ),
        sheet: null,
        keypadValue: '',
      }
    }

    case 'DELETE_ENTRY':
      return {
        ...state,
        entries: state.entries.filter((e) => e.date !== action.date),
        sheet: null,
        keypadValue: '',
      }

    case 'SET_PHASE': {
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
      return { ...state, targetLbs: action.value, sheet: null, keypadValue: '' }

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

    case 'RESET_TO_IMPORT':
      return { ...state, entries: action.entries }

    default:
      return state
  }
}
