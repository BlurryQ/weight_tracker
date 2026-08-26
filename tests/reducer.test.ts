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
