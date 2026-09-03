import { describe, expect, it } from 'vitest'
import { reducer } from '../src/store/reducer'
import { initialState } from '../src/store/types'
import { diffDays, mondayOf, today } from '../src/lib/dates'

describe('reducer — SET_PHASE', () => {
  it('is a no-op when tapping the already-selected phase (does not reset the week counter)', () => {
    const state = { ...initialState(), phase: 'Cut' as const, phaseStart: '2026-08-03' }
    const next = reducer(state, { type: 'SET_PHASE', phase: 'Cut' })
    expect(next).toBe(state) // same reference — nothing changed
  })

  it('resets phaseStart to today and logs the change when the phase actually changes', () => {
    const state = { ...initialState(), phase: 'Cut' as const, phaseStart: '2026-08-03' }
    const next = reducer(state, { type: 'SET_PHASE', phase: 'Bulk' })
    expect(next.phase).toBe('Bulk')
    expect(next.phaseStart).toBe(today())
    expect(next.phaseLog[next.phaseLog.length - 1]).toEqual({ start: today(), name: 'Bulk' })
  })
})

describe('reducer — STAGE_PHASE / COMMIT_PHASE_CHANGE / UNDO_PHASE_CHANGE (the staged commit)', () => {
  it('STAGE_PHASE sets pendingPhase only — phase/phaseStart/phaseLog are untouched', () => {
    const state = { ...initialState(), phase: 'Cut' as const, phaseStart: '2026-08-03' }
    const next = reducer(state, { type: 'STAGE_PHASE', phase: 'Bulk' })
    expect(next.pendingPhase).toBe('Bulk')
    expect(next.phase).toBe('Cut')
    expect(next.phaseStart).toBe('2026-08-03')
    expect(next.phaseLog).toBe(state.phaseLog)
  })

  it('STAGE_PHASE on the already-current phase is a no-op when nothing is pending', () => {
    const state = { ...initialState(), phase: 'Cut' as const, pendingPhase: null }
    const next = reducer(state, { type: 'STAGE_PHASE', phase: 'Cut' })
    expect(next).toBe(state)
  })

  it('STAGE_PHASE on the already-current phase clears a stray pending selection', () => {
    const state = { ...initialState(), phase: 'Cut' as const, pendingPhase: 'Bulk' as const }
    const next = reducer(state, { type: 'STAGE_PHASE', phase: 'Cut' })
    expect(next.pendingPhase).toBeNull()
  })

  it('STAGE_PHASE on the already-staged phase again cancels the staging', () => {
    const state = { ...initialState(), phase: 'Cut' as const, pendingPhase: 'Bulk' as const }
    const next = reducer(state, { type: 'STAGE_PHASE', phase: 'Bulk' })
    expect(next.pendingPhase).toBeNull()
  })

  it('STAGE_PHASE on a different phase replaces whatever was staged', () => {
    const state = { ...initialState(), phase: 'Cut' as const, pendingPhase: 'Bulk' as const }
    const next = reducer(state, { type: 'STAGE_PHASE', phase: 'Maintain' })
    expect(next.pendingPhase).toBe('Maintain')
  })

  it('COMMIT_PHASE_CHANGE with nothing staged is a no-op', () => {
    const state = { ...initialState(), phase: 'Cut' as const, pendingPhase: null }
    const next = reducer(state, { type: 'COMMIT_PHASE_CHANGE' })
    expect(next.phase).toBe('Cut')
    expect(next.pendingPhase).toBeNull()
    expect(next.phaseUndo).toBeNull()
  })

  it('COMMIT_PHASE_CHANGE applies the staged phase and stashes the pre-change state for undo', () => {
    const state = {
      ...initialState(),
      phase: 'Cut' as const,
      phaseStart: '2026-08-03',
      phaseLog: [{ start: '2026-08-03', name: 'Cut' as const }],
      pendingPhase: 'Bulk' as const,
    }
    const next = reducer(state, { type: 'COMMIT_PHASE_CHANGE' })
    expect(next.phase).toBe('Bulk')
    expect(next.phaseStart).toBe(today())
    expect(next.phaseLog[next.phaseLog.length - 1]).toEqual({ start: today(), name: 'Bulk' })
    expect(next.pendingPhase).toBeNull()
    expect(next.phaseUndo).toEqual({ phase: 'Cut', phaseStart: '2026-08-03', phaseLog: state.phaseLog })
  })

  it('UNDO_PHASE_CHANGE with nothing stashed is a no-op', () => {
    const state = { ...initialState(), phaseUndo: null }
    const next = reducer(state, { type: 'UNDO_PHASE_CHANGE' })
    expect(next).toBe(state)
  })

  it('UNDO_PHASE_CHANGE restores the stashed phase/phaseStart/phaseLog and clears the stash + toast', () => {
    const staged = {
      ...initialState(),
      phase: 'Cut' as const,
      phaseStart: '2026-08-03',
      phaseLog: [{ start: '2026-08-03', name: 'Cut' as const }],
      pendingPhase: 'Bulk' as const,
    }
    const committed = reducer(staged, { type: 'COMMIT_PHASE_CHANGE' })
    const withToast = reducer(committed, { type: 'SHOW_TOAST', message: 'Bulk started' })
    const undone = reducer(withToast, { type: 'UNDO_PHASE_CHANGE' })
    expect(undone.phase).toBe('Cut')
    expect(undone.phaseStart).toBe('2026-08-03')
    expect(undone.phaseLog).toEqual(staged.phaseLog)
    expect(undone.phaseUndo).toBeNull()
    expect(undone.toast).toBeNull()
  })

  it('CLEAR_TOAST also drops a pending undo stash — undo only lives as long as its toast', () => {
    const state = { ...initialState(), toast: 'Bulk started', phaseUndo: { phase: 'Cut' as const, phaseStart: '2026-08-03', phaseLog: [] } }
    const next = reducer(state, { type: 'CLEAR_TOAST' })
    expect(next.toast).toBeNull()
    expect(next.phaseUndo).toBeNull()
  })
})

describe('reducer — SET_PHASE_WEEK', () => {
  it('sets phaseStart so the week counter reads the requested week as of today', () => {
    const state = initialState()
    const next = reducer(state, { type: 'SET_PHASE_WEEK', week: 4 })
    const impliedWeek = Math.floor(diffDays(mondayOf(next.phaseStart), today()) / 7) + 1
    expect(impliedWeek).toBe(4)
  })

  it('clamps to a minimum of week 1', () => {
    const state = initialState()
    const next = reducer(state, { type: 'SET_PHASE_WEEK', week: 0 })
    expect(next.phaseStart).toBe(mondayOf(today()))
  })

  it('does not touch phaseLog', () => {
    const state = { ...initialState(), phaseLog: [{ start: '2026-08-03', name: 'Cut' as const }] }
    const next = reducer(state, { type: 'SET_PHASE_WEEK', week: 6 })
    expect(next.phaseLog).toBe(state.phaseLog)
  })
})

describe('reducer — LOG_FOLDED_WEEK vs SET_PHASE (the phase-model split)', () => {
  it('LOG_FOLDED_WEEK appends to phaseLog but leaves phase/phaseStart untouched', () => {
    const state = { ...initialState(), phase: 'Cut' as const, phaseStart: '2026-08-03' }
    const next = reducer(state, { type: 'LOG_FOLDED_WEEK', name: 'Deload' })
    expect(next.phase).toBe('Cut') // unchanged — still a Cut, just a Deload week within it
    expect(next.phaseStart).toBe('2026-08-03') // week counter keeps running
    expect(next.phaseLog[next.phaseLog.length - 1]).toEqual({ start: today(), name: 'Deload' })
  })

  it('LOG_FOLDED_WEEK works the same for Maintain', () => {
    const state = { ...initialState(), phase: 'Bulk' as const, phaseStart: '2026-06-01' }
    const next = reducer(state, { type: 'LOG_FOLDED_WEEK', name: 'Maintain' })
    expect(next.phase).toBe('Bulk')
    expect(next.phaseStart).toBe('2026-06-01')
    expect(next.phaseLog[next.phaseLog.length - 1]).toEqual({ start: today(), name: 'Maintain' })
  })

  it('SET_PHASE behavior is unchanged by the split — still a real phase change for all four names', () => {
    const state = { ...initialState(), phase: 'Cut' as const, phaseStart: '2026-08-03' }
    const next = reducer(state, { type: 'SET_PHASE', phase: 'Maintain' })
    expect(next.phase).toBe('Maintain') // SET_PHASE can still make Maintain the real ongoing phase
    expect(next.phaseStart).toBe(today()) // and it does reset the counter, unlike LOG_FOLDED_WEEK
    expect(next.phaseLog[next.phaseLog.length - 1]).toEqual({ start: today(), name: 'Maintain' })
  })

  it('a folded week logged the same ISO week as a real phase change is superseded by it (last-wins dedupe)', () => {
    // Both actions append via the same withPhaseLogAppend/dedupePhaseLog path, so ordering
    // matters the same way it always has for phaseLog — no special-casing needed here.
    const state = { ...initialState(), phase: 'Cut' as const, phaseStart: '2026-08-03' }
    const afterFold = reducer(state, { type: 'LOG_FOLDED_WEEK', name: 'Deload' })
    const afterPhaseChange = reducer(afterFold, { type: 'SET_PHASE', phase: 'Bulk' })
    const thisWeekEntries = afterPhaseChange.phaseLog.filter((p) => mondayOf(p.start) === mondayOf(today()))
    expect(thisWeekEntries).toEqual([{ start: today(), name: 'Bulk' }])
  })
})

describe('reducer — SET_TREND_WINDOW_MODE', () => {
  it('sets trendWindowMode independently of trendWindow', () => {
    const state = { ...initialState(), trendWindow: 26 as const }
    const next = reducer(state, { type: 'SET_TREND_WINDOW_MODE', mode: 'phaseStart' })
    expect(next.trendWindowMode).toBe('phaseStart')
    expect(next.trendWindow).toBe(26) // untouched — not a TrendWindow union widen
  })
})

describe('reducer — MERGE_NUTRITION', () => {
  it('upserts by date with the incoming value winning, sorted ascending', () => {
    const state = {
      ...initialState(),
      nutrition: [
        { date: '2026-08-10', kcal: 2000 },
        { date: '2026-08-12', kcal: 2100 },
      ],
    }
    const next = reducer(state, {
      type: 'MERGE_NUTRITION',
      entries: [
        { date: '2026-08-12', kcal: 2250 }, // updates
        { date: '2026-08-11', kcal: 1950 }, // inserts, out of order
      ],
    })
    expect(next.nutrition).toEqual([
      { date: '2026-08-10', kcal: 2000 },
      { date: '2026-08-11', kcal: 1950 },
      { date: '2026-08-12', kcal: 2250 },
    ])
  })

  it('is a no-op (same reference) when given an empty list', () => {
    const state = { ...initialState(), nutrition: [{ date: '2026-08-10', kcal: 2000 }] }
    const next = reducer(state, { type: 'MERGE_NUTRITION', entries: [] })
    expect(next).toBe(state)
  })
})

describe('reducer — TAP_KEY (keypad overtype)', () => {
  it('overtypes a pristine (prefilled) value on the first tap instead of appending', () => {
    const state = { ...initialState(), keypadValue: '183.4', keypadPristine: true }
    const next = reducer(state, { type: 'TAP_KEY', key: '1' })
    expect(next.keypadValue).toBe('1') // not "183.41"
    expect(next.keypadPristine).toBe(false)
  })

  it('backspace on a pristine value clears it entirely rather than trimming one character', () => {
    const state = { ...initialState(), keypadValue: '183.4', keypadPristine: true }
    const next = reducer(state, { type: 'TAP_KEY', key: '⌫' })
    expect(next.keypadValue).toBe('')
  })

  it('appends normally once no longer pristine (after the first tap)', () => {
    const state = { ...initialState(), keypadValue: '1', keypadPristine: false }
    const next = reducer(state, { type: 'TAP_KEY', key: '8' })
    expect(next.keypadValue).toBe('18')
  })

  it('OPEN_SHEET marks pristine only when there is something to prefill', () => {
    const withEntry = { ...initialState(), entries: [{ date: '2026-08-24', lbs: 183.4 }] }
    const opened = reducer(withEntry, { type: 'OPEN_SHEET', sheet: '2026-08-24' })
    expect(opened.keypadPristine).toBe(true)

    const emptyDay = reducer(withEntry, { type: 'OPEN_SHEET', sheet: '2026-08-25' })
    expect(emptyDay.keypadPristine).toBe(false)
  })
})
