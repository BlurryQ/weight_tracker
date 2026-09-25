import { describe, expect, it } from 'vitest'
import { mergeRemote, settingsFrom } from '../src/data/merge'
import type { QueueOp } from '../src/data/queue'
import type { RemoteSnapshot } from '../src/data/api'
import { initialState } from '../src/store/types'

const local = (over: Partial<ReturnType<typeof initialState>> = {}) => ({ ...initialState(), ...over })
const remote = (over: Partial<RemoteSnapshot> = {}): RemoteSnapshot => ({
  entries: [],
  nutrition: [],
  phaseLog: [],
  settings: settingsFrom(initialState()),
  ...over,
})
let ts = 0
const op = (o: Omit<QueueOp, 'ts'>): QueueOp => ({ ...o, ts: ++ts }) as QueueOp

describe('mergeRemote — entries', () => {
  it('keeps a local-only entry and enqueues an upsert for it', () => {
    const r = mergeRemote(local({ entries: [{ date: '2026-08-05', lbs: 180 }] }), remote(), [])
    expect(r.state.entries).toEqual([{ date: '2026-08-05', lbs: 180 }])
    expect(r.enqueue).toContainEqual({ op: 'upsert_entry', payload: { date: '2026-08-05', lbs: 180 } })
  })

  it('adds remote-only entries, sorted, without enqueueing anything', () => {
    const r = mergeRemote(
      local({ entries: [{ date: '2026-08-06', lbs: 181 }] }),
      remote({ entries: [{ date: '2026-08-06', lbs: 181 }, { date: '2026-08-04', lbs: 182 }] }),
      [],
    )
    expect(r.state.entries).toEqual([{ date: '2026-08-04', lbs: 182 }, { date: '2026-08-06', lbs: 181 }])
    expect(r.enqueue.filter((o) => o.op === 'upsert_entry')).toEqual([])
  })

  it('remote wins when both have the date and nothing is pending', () => {
    const r = mergeRemote(
      local({ entries: [{ date: '2026-08-05', lbs: 180 }] }),
      remote({ entries: [{ date: '2026-08-05', lbs: 179 }] }),
      [],
    )
    expect(r.state.entries).toEqual([{ date: '2026-08-05', lbs: 179 }])
  })

  it('a pending upsert wins over the remote row', () => {
    const r = mergeRemote(
      local({ entries: [{ date: '2026-08-05', lbs: 178 }] }),
      remote({ entries: [{ date: '2026-08-05', lbs: 179 }] }),
      [op({ op: 'upsert_entry', payload: { date: '2026-08-05', lbs: 178 } })],
    )
    expect(r.state.entries).toEqual([{ date: '2026-08-05', lbs: 178 }])
    expect(r.enqueue.filter((o) => o.op === 'upsert_entry')).toEqual([])
  })

  it('a pending delete removes the entry even though the remote still has it', () => {
    const r = mergeRemote(
      local(),
      remote({ entries: [{ date: '2026-08-05', lbs: 179 }] }),
      [op({ op: 'delete_entry', payload: { date: '2026-08-05' } })],
    )
    expect(r.state.entries).toEqual([])
  })

  it('an empty remote does NOT wipe local data', () => {
    const entries = [{ date: '2026-08-04', lbs: 181 }, { date: '2026-08-05', lbs: 180 }]
    const r = mergeRemote(local({ entries, nutrition: [{ date: '2026-08-05', kcal: 2000 }] }), remote(), [])
    expect(r.state.entries).toEqual(entries)
    expect(r.state.nutrition).toEqual([{ date: '2026-08-05', kcal: 2000 }])
    expect(r.enqueue.filter((o) => o.op === 'upsert_entry')).toHaveLength(2)
  })

  it('honours an op enqueued after the fetch started (queue is read at merge time)', () => {
    // Fetch began with an empty queue; the user saved 08-05 mid-flight. The merge is handed the
    // queue as it stands when the fetch returns, and the stale remote (which lacks it) must lose.
    const queueAtReturn = [op({ op: 'upsert_entry', payload: { date: '2026-08-05', lbs: 177 } })]
    const r = mergeRemote(
      local({ entries: [{ date: '2026-08-05', lbs: 177 }] }),
      remote({ entries: [{ date: '2026-08-05', lbs: 180 }] }),
      queueAtReturn,
    )
    expect(r.state.entries).toEqual([{ date: '2026-08-05', lbs: 177 }])
  })

  it('does not re-enqueue a local-only entry that already has a pending op', () => {
    const r = mergeRemote(
      local({ entries: [{ date: '2026-08-05', lbs: 177 }] }),
      remote(),
      [op({ op: 'upsert_entry', payload: { date: '2026-08-05', lbs: 177 } })],
    )
    expect(r.state.entries).toEqual([{ date: '2026-08-05', lbs: 177 }])
    expect(r.enqueue.filter((o) => o.op === 'upsert_entry')).toEqual([])
  })
})

describe('mergeRemote — nutrition', () => {
  it('keeps local-only days (enqueued), adds remote-only days, lets a pending op win', () => {
    const r = mergeRemote(
      local({ nutrition: [{ date: '2026-08-05', kcal: 2100 }, { date: '2026-08-06', kcal: 1900 }] }),
      remote({ nutrition: [{ date: '2026-08-04', kcal: 2500 }, { date: '2026-08-06', kcal: 1800 }] }),
      [op({ op: 'upsert_nutrition', payload: { date: '2026-08-06', kcal: 1900 } })],
    )
    expect(r.state.nutrition).toEqual([
      { date: '2026-08-04', kcal: 2500 },
      { date: '2026-08-05', kcal: 2100 },
      { date: '2026-08-06', kcal: 1900 },
    ])
    expect(r.enqueue.filter((o) => o.op === 'upsert_nutrition')).toEqual([
      { op: 'upsert_nutrition', payload: { date: '2026-08-05', kcal: 2100 } },
    ])
  })
})

describe('mergeRemote — phaseLog', () => {
  it('unions phases, enqueues local-only ones, and dedupes per week', () => {
    const r = mergeRemote(
      local({ phaseLog: [{ start: '2026-07-06', name: 'Cut' }, { start: '2026-08-03', name: 'Deload' }] }),
      remote({ phaseLog: [{ start: '2026-07-06', name: 'Cut' }, { start: '2026-06-01', name: 'Bulk' }] }),
      [],
    )
    expect(r.state.phaseLog).toEqual([
      { start: '2026-06-01', name: 'Bulk' },
      { start: '2026-07-06', name: 'Cut' },
      { start: '2026-08-03', name: 'Deload' },
    ])
    expect(r.enqueue.filter((o) => o.op === 'upsert_phase')).toEqual([
      { op: 'upsert_phase', payload: { start: '2026-08-03', name: 'Deload' } },
    ])
  })

  it('does not enqueue a local-only phase that already has a pending upsert', () => {
    const r = mergeRemote(
      local({ phaseLog: [{ start: '2026-08-03', name: 'Deload' }] }),
      remote({ phaseLog: [{ start: '2026-07-06', name: 'Cut' }] }),
      [op({ op: 'upsert_phase', payload: { start: '2026-08-03', name: 'Deload' } })],
    )
    expect(r.enqueue.filter((o) => o.op === 'upsert_phase')).toEqual([])
    expect(r.state.phaseLog).toHaveLength(2)
  })
})

describe('mergeRemote — settings', () => {
  const pending = { ...settingsFrom(initialState()), trendWindow: 52 as const }

  it('the latest pending settings op overrides the remote settings', () => {
    const r = mergeRemote(
      local(),
      remote(),
      [
        op({ op: 'upsert_settings', payload: { ...pending, trendWindow: 13 } }),
        op({ op: 'upsert_settings', payload: pending }),
      ],
    )
    expect(r.state.trendWindow).toBe(52)
    expect(r.enqueue.filter((o) => o.op === 'upsert_settings')).toEqual([])
  })

  it('uses remote settings when nothing is pending', () => {
    const r = mergeRemote(local(), remote({ settings: { ...pending, trendWindow: 8 } }), [])
    expect(r.state.trendWindow).toBe(8)
  })

  it('enqueues local settings when the remote has none', () => {
    const r = mergeRemote(local({ unit: 'kg' }), remote({ settings: null }), [])
    expect(r.state.unit).toBeUndefined() // local stays as-is
    expect(r.enqueue).toContainEqual({ op: 'upsert_settings', payload: settingsFrom(local({ unit: 'kg' })) })
  })

  it('does not enqueue local settings when one is already pending', () => {
    const r = mergeRemote(local(), remote({ settings: null }), [op({ op: 'upsert_settings', payload: pending })])
    expect(r.enqueue.filter((o) => o.op === 'upsert_settings')).toEqual([])
    expect(r.state.trendWindow).toBe(52)
  })
})
