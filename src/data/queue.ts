import type { PhaseName } from '../lib/math'
import type { SolveMode, TrendHorizon, TrendWindow, Unit } from '../store/types'

export interface SettingsPayload {
  phase: PhaseName
  phaseStart: string
  weeklyTarget: number
  unit: Unit
  trendWindow: TrendWindow
  trendHorizon: TrendHorizon
  solveMode: SolveMode
  targetLbs: number
  targetWeeks: number
}

export type QueueOp =
  | { op: 'upsert_entry'; payload: { date: string; lbs: number }; ts: number }
  | { op: 'delete_entry'; payload: { date: string }; ts: number }
  | { op: 'upsert_phase'; payload: { start: string; name: PhaseName }; ts: number }
  | { op: 'upsert_settings'; payload: SettingsPayload; ts: number }

const QUEUE_KEY = 'wt.queue'

function read(): QueueOp[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY)
    return raw ? (JSON.parse(raw) as QueueOp[]) : []
  } catch {
    return []
  }
}

function write(queue: QueueOp[]): void {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue))
  } catch {
    // Best-effort — if this throws the op is lost, but the optimistic UI update already
    // happened via the reducer, so the user's action isn't silently dropped from their view.
  }
}

export function enqueue(op: Omit<QueueOp, 'ts'>): void {
  const queue = read()
  queue.push({ ...op, ts: Date.now() } as QueueOp)
  write(queue)
}

export function peekAll(): QueueOp[] {
  return read()
}

/** Removes the first `n` queued operations (they've been successfully synced). */
export function dequeue(n: number): void {
  const queue = read()
  write(queue.slice(n))
}

export function queueLength(): number {
  return read().length
}
