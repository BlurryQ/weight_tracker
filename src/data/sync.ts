import {
  deleteEntry,
  fetchAll,
  upsertDailyNutrition,
  upsertEntry,
  upsertPhaseLogEntry,
  upsertSettings,
  type RemoteSnapshot,
} from './api'
import { deadLetterCount, peekAll, recordPermanentFailure, remove, type QueueOp } from './queue'

async function applyOp(op: QueueOp): Promise<void> {
  switch (op.op) {
    case 'upsert_entry':
      return upsertEntry(op.payload.date, op.payload.lbs)
    case 'delete_entry':
      return deleteEntry(op.payload.date)
    case 'upsert_nutrition':
      return upsertDailyNutrition(op.payload.date, op.payload.kcal)
    case 'upsert_phase':
      return upsertPhaseLogEntry(op.payload.start, op.payload.name)
    case 'upsert_settings':
      return upsertSettings(op.payload)
  }
}

/** True only when the server definitively rejected the write itself: a Postgres data/constraint
 * violation (22xxx/23xxx) or an HTTP 4xx other than auth (401/403) and retry-later (408/429).
 * Network errors, timeouts, 5xx and anything unrecognised are transient — retrying is always safe,
 * dropping never is. */
export function isPermanentError(err: unknown): boolean {
  const { status, code } = (err ?? {}) as { status?: unknown; code?: unknown }
  if (typeof status === 'number' && status >= 400 && status < 500) {
    return ![401, 403, 408, 429].includes(status)
  }
  return typeof code === 'string' && /^2[23]\d{3}$/.test(code)
}

const REQUEST_TIMEOUT_MS = 30_000

/** A hung request would otherwise hold the drain guard forever; a timeout counts as transient. */
function withTimeout(p: Promise<void>): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('sync request timed out')), REQUEST_TIMEOUT_MS)
    p.then(resolve, reject).finally(() => clearTimeout(timer))
  })
}

let draining = false

/** Replays queued writes in order, one at a time. Stops (leaving the rest queued) on the first
 * failure, so a transient network blip doesn't reorder or drop later writes. A permanently
 * rejected op gets one attempt per drain; after MAX_ATTEMPTS it's parked in the dead-letter list
 * (not deleted) so it stops blocking everything behind it. Only one drain runs at a time. */
export async function drainQueue(onSyncFailed: (failed: boolean) => void): Promise<void> {
  if (draining) return
  draining = true
  try {
    for (;;) {
      const queue = peekAll()
      if (!queue.length) {
        onSyncFailed(deadLetterCount() > 0)
        return
      }
      const op = queue[0]
      try {
        await withTimeout(applyOp(op))
        remove(op)
      } catch (err) {
        if (isPermanentError(err) && recordPermanentFailure(op, describe(err))) continue
        onSyncFailed(true)
        return
      }
    }
  } finally {
    draining = false
  }
}

function describe(err: unknown): string {
  const { message, code } = (err ?? {}) as { message?: unknown; code?: unknown }
  return [code, message].filter((x) => typeof x === 'string' && x).join(': ') || 'unknown error'
}

/** Fetches the full remote snapshot on boot. The caller merges it into local state (see
 * data/merge.ts) rather than overwriting. Returns null if not configured/signed in, or if the fetch itself
 * fails (network error, auth issue, etc) — caller keeps local cache either way. */
export async function pullRemote(onPullFailed: (failed: boolean) => void): Promise<RemoteSnapshot | null> {
  try {
    const remote = await fetchAll()
    onPullFailed(false)
    return remote
  } catch (err) {
    console.error('[sync] pullRemote failed', err)
    onPullFailed(true)
    return null
  }
}

/** Wires background sync to connectivity/visibility changes. Returns a cleanup function. */
export function startAutoSync(onSyncFailed: (failed: boolean) => void): () => void {
  const attempt = () => {
    void drainQueue(onSyncFailed)
  }
  window.addEventListener('online', attempt)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') attempt()
  })
  return () => {
    window.removeEventListener('online', attempt)
  }
}
