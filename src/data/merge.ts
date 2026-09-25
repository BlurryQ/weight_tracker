import { mondayOf } from '../lib/dates'
import { dedupePhaseLog } from '../lib/math'
import type { PersistedState } from '../store/types'
import type { RemoteSnapshot } from './api'
import type { NewQueueOp, QueueOp, SettingsPayload } from './queue'

export function settingsFrom(state: PersistedState): SettingsPayload {
  return {
    phase: state.phase,
    phaseStart: state.phaseStart,
    weeklyTarget: state.weeklyTarget,
    unit: state.unit,
    trendWindow: state.trendWindow,
    trendWindowMode: state.trendWindowMode,
    solveMode: state.solveMode,
    targetLbs: state.targetLbs,
    targetWeeks: state.targetWeeks,
  }
}

export interface MergeResult {
  /** Partial state to HYDRATE with. */
  state: Partial<PersistedState>
  /** Writes the caller must enqueue: local rows Supabase doesn't have yet. */
  enqueue: NewQueueOp[]
}

/** Merges a fetched remote snapshot into local state instead of overwriting it, so nothing
 * recorded locally is ever lost to a pull. Per row: a still-pending queue op wins (it's newer
 * than anything the server can have), else the remote row wins, else a local-only row is kept
 * and queued for upload. Remote-only rows are added. Call it with the queue and local state as
 * they are when the fetch *returns*, so writes made mid-fetch are honoured.
 *
 * Trade-off: a local-only row could theoretically be one deleted remotely from another device.
 * Accepted — single-user app, and the local copy wins rather than risk silently losing a weigh-in. */
export function mergeRemote(local: PersistedState, remote: RemoteSnapshot, queue: QueueOp[]): MergeResult {
  const enqueue: NewQueueOp[] = []

  const entries = new Map(remote.entries.map((e) => [e.date, e]))
  const nutrition = new Map(remote.nutrition.map((n) => [n.date, n]))
  const phases = new Map(remote.phaseLog.map((p) => [mondayOf(p.start), p]))
  const entryPending = new Set<string>()
  const nutritionPending = new Set<string>()
  const phasePending = new Set<string>()
  let pendingSettings: SettingsPayload | null = null

  // Queue order is write order, so a later op for the same key overrides an earlier one.
  for (const q of queue) {
    switch (q.op) {
      case 'upsert_entry':
        entries.set(q.payload.date, { date: q.payload.date, lbs: q.payload.lbs })
        entryPending.add(q.payload.date)
        break
      case 'delete_entry':
        entries.delete(q.payload.date)
        entryPending.add(q.payload.date)
        break
      case 'upsert_nutrition':
        nutrition.set(q.payload.date, { date: q.payload.date, kcal: q.payload.kcal })
        nutritionPending.add(q.payload.date)
        break
      case 'upsert_phase':
        phases.set(mondayOf(q.payload.start), { start: q.payload.start, name: q.payload.name })
        phasePending.add(mondayOf(q.payload.start))
        break
      case 'upsert_settings':
        pendingSettings = q.payload
        break
    }
  }

  // Local-only rows (absent remotely, with no pending op deciding their fate) are kept and queued.
  const remoteEntryDates = new Set(remote.entries.map((e) => e.date))
  for (const e of local.entries) {
    if (remoteEntryDates.has(e.date) || entryPending.has(e.date)) continue
    entries.set(e.date, e)
    enqueue.push({ op: 'upsert_entry', payload: { date: e.date, lbs: e.lbs } })
  }
  const remoteNutritionDates = new Set(remote.nutrition.map((n) => n.date))
  for (const n of local.nutrition) {
    if (remoteNutritionDates.has(n.date) || nutritionPending.has(n.date)) continue
    nutrition.set(n.date, n)
    enqueue.push({ op: 'upsert_nutrition', payload: { date: n.date, kcal: n.kcal } })
  }
  const remotePhaseMondays = new Set(remote.phaseLog.map((p) => mondayOf(p.start)))
  for (const p of dedupePhaseLog(local.phaseLog)) {
    const key = mondayOf(p.start)
    if (remotePhaseMondays.has(key) || phasePending.has(key)) continue
    phases.set(key, p)
    enqueue.push({ op: 'upsert_phase', payload: { start: p.start, name: p.name } })
  }

  const byDate = <T extends { date: string }>(m: Map<string, T>) =>
    [...m.values()].sort((a, b) => (a.date < b.date ? -1 : 1))

  // A pending settings write is newer than the remote row; with neither, local settings go up.
  const settings: SettingsPayload | null = pendingSettings ?? remote.settings
  if (!settings) enqueue.push({ op: 'upsert_settings', payload: settingsFrom(local) })

  return {
    state: {
      entries: byDate(entries),
      nutrition: byDate(nutrition),
      phaseLog: dedupePhaseLog([...phases.values()]),
      ...(settings ?? {}),
    },
    enqueue,
  }
}
