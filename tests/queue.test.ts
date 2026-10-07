import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/data/api', () => ({
  upsertEntry: vi.fn(),
  deleteEntry: vi.fn(),
  upsertDailyNutrition: vi.fn(),
  upsertPhaseLogEntry: vi.fn(),
  upsertSettings: vi.fn(),
  fetchAll: vi.fn(),
}))

import * as api from '../src/data/api'
import { deadLetterCount, enqueue, MAX_ATTEMPTS, peekAll } from '../src/data/queue'
import { drainQueue, isPermanentError } from '../src/data/sync'
import { initialState } from '../src/store/types'
import { settingsFrom } from '../src/data/merge'

// Vitest runs in node here, so give the modules an in-memory localStorage.
const store = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
})

const upsertEntry = vi.mocked(api.upsertEntry)
const upsertSettings = vi.mocked(api.upsertSettings)
const constraintError = () => Object.assign(new Error('violates check constraint'), { code: '23514', status: 400 })
const entry = (date: string) => enqueue({ op: 'upsert_entry', payload: { date, lbs: 180 } })

beforeEach(() => {
  store.clear()
  vi.resetAllMocks()
})

describe('isPermanentError', () => {
  it('treats constraint violations and plain 4xx as permanent', () => {
    expect(isPermanentError({ code: '23514' })).toBe(true)
    expect(isPermanentError({ status: 400 })).toBe(true)
    expect(isPermanentError({ status: 404 })).toBe(true)
  })

  it('treats auth, timeout, rate-limit, 5xx, network and unknown errors as transient', () => {
    for (const status of [401, 403, 408, 429, 500, 503, 0]) expect(isPermanentError({ status })).toBe(false)
    expect(isPermanentError(new TypeError('Failed to fetch'))).toBe(false)
    expect(isPermanentError({ code: 'PGRST301' })).toBe(false)
    expect(isPermanentError(undefined)).toBe(false)
  })
})

describe('drainQueue', () => {
  it('a transient error never counts against the op, no matter how often it repeats', async () => {
    upsertEntry.mockRejectedValue(new TypeError('Failed to fetch'))
    entry('2026-08-05')
    const cb = vi.fn()
    for (let i = 0; i < MAX_ATTEMPTS * 2; i++) await drainQueue(cb)
    expect(peekAll()).toHaveLength(1)
    expect(peekAll()[0].attempts).toBeUndefined()
    expect(deadLetterCount()).toBe(0)
    expect(cb).toHaveBeenLastCalledWith(true)
  })

  it('dead-letters an op after 5 permanent failures and carries on with the next one', async () => {
    upsertEntry.mockImplementation(async (date) => {
      if (date === '2026-08-05') throw constraintError()
    })
    entry('2026-08-05')
    entry('2026-08-06')
    const cb = vi.fn()

    for (let i = 1; i < MAX_ATTEMPTS; i++) {
      await drainQueue(cb)
      expect(peekAll()).toHaveLength(2) // still blocking, attempts counted
      expect(peekAll()[0].attempts).toBe(i)
    }
    expect(deadLetterCount()).toBe(0)

    await drainQueue(cb) // 5th failure: parked, and the next op proceeds in the same drain
    expect(peekAll()).toEqual([])
    expect(upsertEntry).toHaveBeenLastCalledWith('2026-08-06', 180)
    expect(deadLetterCount()).toBe(1)
    const parked = JSON.parse(store.get('wt.deadletter')!)[0]
    expect(parked.op.payload).toEqual({ date: '2026-08-05', lbs: 180 })
    expect(parked.error).toContain('violates check constraint')
    expect(cb).toHaveBeenLastCalledWith(true) // stays "failed" while anything is dead-lettered
  })

  it('reports healthy once the queue drains with an empty dead-letter list', async () => {
    upsertEntry.mockResolvedValue()
    entry('2026-08-05')
    const cb = vi.fn()
    await drainQueue(cb)
    expect(peekAll()).toEqual([])
    expect(cb).toHaveBeenLastCalledWith(false)
  })

  it('caps the dead-letter list at 200, dropping the oldest', async () => {
    store.set('wt.deadletter', JSON.stringify(Array.from({ length: 200 }, (_, i) => ({ op: {}, error: `old${i}`, ts: i }))))
    upsertEntry.mockRejectedValue(constraintError())
    entry('2026-08-05')
    for (let i = 0; i < MAX_ATTEMPTS; i++) await drainQueue(vi.fn())
    const list = JSON.parse(store.get('wt.deadletter')!)
    expect(list).toHaveLength(200)
    expect(list[0].error).toBe('old1')
    expect(list[199].op.payload.date).toBe('2026-08-05')
  })

  it('does not run concurrently with itself', async () => {
    let release!: () => void
    upsertEntry.mockImplementation(() => new Promise<void>((r) => (release = r)))
    entry('2026-08-05')
    const first = drainQueue(vi.fn())
    await drainQueue(vi.fn()) // returns immediately while the first is in flight
    expect(upsertEntry).toHaveBeenCalledTimes(1)
    release()
    await first
    expect(peekAll()).toEqual([])
  })
})

describe('enqueue — settings coalescing', () => {
  it('replaces an older pending settings op instead of appending', () => {
    const s = settingsFrom(initialState())
    enqueue({ op: 'upsert_settings', payload: { ...s, trendWindow: 13 } })
    entry('2026-08-05')
    enqueue({ op: 'upsert_settings', payload: { ...s, trendWindow: 52 } })
    const q = peekAll()
    expect(q.map((o) => o.op)).toEqual(['upsert_entry', 'upsert_settings'])
    expect(q[1].op === 'upsert_settings' && q[1].payload.trendWindow).toBe(52)
  })

  it('an in-flight settings op that gets coalesced away does not remove its replacement', async () => {
    const s = settingsFrom(initialState())
    let release!: () => void
    upsertSettings.mockImplementationOnce(() => new Promise<void>((r) => (release = r)))
    enqueue({ op: 'upsert_settings', payload: { ...s, trendWindow: 13 } })
    const first = drainQueue(vi.fn())
    enqueue({ op: 'upsert_settings', payload: { ...s, trendWindow: 52 } })
    release()
    await first
    expect(upsertSettings).toHaveBeenCalledTimes(2) // the drain loop then sent the newer one
    expect(upsertSettings).toHaveBeenLastCalledWith(expect.objectContaining({ trendWindow: 52 }))
    expect(peekAll()).toEqual([])
  })
})
