import type { PhaseName } from '../lib/math'
import type { SolveMode, TrendWindow, TrendWindowMode, Unit } from '../store/types'

export interface SettingsPayload {
  phase: PhaseName
  phaseStart: string
  weeklyTarget: number
  unit: Unit
  trendWindow: TrendWindow
  trendWindowMode: TrendWindowMode
  solveMode: SolveMode
  targetLbs: number
  targetWeeks: number
}

/** What callers enqueue; `ts` is stamped on write, and attempts/lastError track permanent failures. */
export type NewQueueOp =
  | { op: 'upsert_entry'; payload: { date: string; lbs: number } }
  | { op: 'delete_entry'; payload: { date: string } }
  | { op: 'upsert_nutrition'; payload: { date: string; kcal: number } }
  | { op: 'upsert_phase'; payload: { start: string; name: PhaseName } }
  | { op: 'upsert_settings'; payload: SettingsPayload }

export type QueueOp = NewQueueOp & { ts: number; attempts?: number; lastError?: string }

/** A queue op that permanently failed MAX_ATTEMPTS times, parked here instead of blocking the queue. */
export interface DeadLetter {
  op: QueueOp
  error: string
  ts: number
}

const QUEUE_KEY = 'wt.queue'
const DEAD_LETTER_KEY = 'wt.deadletter'
const DEAD_LETTER_CAP = 200
export const MAX_ATTEMPTS = 5

function readList<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T[]) : []
  } catch {
    return []
  }
}

function writeList(key: string, list: unknown[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(list))
  } catch {
    // Best-effort — if this throws the op is lost, but the optimistic UI update already
    // happened via the reducer, so the user's action isn't silently dropped from their view.
  }
}

const read = () => readList<QueueOp>(QUEUE_KEY)
const write = (queue: QueueOp[]) => writeList(QUEUE_KEY, queue)

/** Same op instance across re-reads of localStorage: ts alone isn't unique (a batch enqueued in
 * one millisecond shares it), so match on the op and payload too. */
function sameOp(a: QueueOp, b: QueueOp): boolean {
  return a.ts === b.ts && a.op === b.op && JSON.stringify(a.payload) === JSON.stringify(b.payload)
}

export function enqueue(op: NewQueueOp): void {
  // Settings writes are whole-row last-write-wins, so an older pending one is dead weight —
  // and one the server rejects would otherwise sit in front of everything queued after it.
  // If the drain has that older op in flight, it just fails to find it afterwards (see remove()).
  const queue = op.op === 'upsert_settings' ? read().filter((q) => q.op !== 'upsert_settings') : read()
  queue.push({ ...op, ts: Date.now() } as QueueOp)
  write(queue)
}

export function peekAll(): QueueOp[] {
  return read()
}

/** Removes one specific queued operation (it's been synced, or dead-lettered). A no-op if it's
 * already gone, e.g. coalesced away while its request was in flight. */
export function remove(op: QueueOp): void {
  const queue = read()
  const i = queue.findIndex((q) => sameOp(q, op))
  if (i === -1) return
  queue.splice(i, 1)
  write(queue)
}

/** Records one permanent failure against `op`. On the MAX_ATTEMPTS-th it moves to the
 * dead-letter list (never deleted) and this returns true so the drain can carry on past it. */
export function recordPermanentFailure(op: QueueOp, error: string): boolean {
  const queue = read()
  const i = queue.findIndex((q) => sameOp(q, op))
  if (i === -1) return false
  const failed = { ...queue[i], attempts: (queue[i].attempts ?? 0) + 1, lastError: error }
  if (failed.attempts < MAX_ATTEMPTS) {
    queue[i] = failed
    write(queue)
    return false
  }
  queue.splice(i, 1)
  // Dead-letter first: if the queue write then fails, the op is duplicated rather than lost.
  writeList(DEAD_LETTER_KEY, [...readList<DeadLetter>(DEAD_LETTER_KEY), { op: failed, error, ts: Date.now() }].slice(-DEAD_LETTER_CAP))
  write(queue)
  return true
}

export function deadLetterCount(): number {
  return readList<DeadLetter>(DEAD_LETTER_KEY).length
}

export function queueLength(): number {
  return read().length
}
