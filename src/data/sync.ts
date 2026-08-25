import { deleteEntry, fetchAll, upsertEntry, upsertPhaseLogEntry, upsertSettings, type RemoteSnapshot } from './api'
import { dequeue, peekAll, type QueueOp } from './queue'

async function applyOp(op: QueueOp): Promise<void> {
  switch (op.op) {
    case 'upsert_entry':
      return upsertEntry(op.payload.date, op.payload.lbs)
    case 'delete_entry':
      return deleteEntry(op.payload.date)
    case 'upsert_phase':
      return upsertPhaseLogEntry(op.payload.start, op.payload.name)
    case 'upsert_settings':
      return upsertSettings(op.payload)
  }
}

/** Replays queued writes in order, one at a time. Stops (leaving the rest queued) on the first
 * failure, so a transient network blip doesn't reorder or drop later writes. */
export async function drainQueue(onSyncFailed: (failed: boolean) => void): Promise<void> {
  for (;;) {
    const queue = peekAll()
    if (!queue.length) {
      onSyncFailed(false)
      return
    }
    try {
      await applyOp(queue[0])
      dequeue(1)
    } catch {
      onSyncFailed(true)
      return
    }
  }
}

/** Fetches the full remote snapshot on boot. Single-user app, so last-fetch-wins is enough —
 * no merge/CRDT logic needed. Returns null if not configured/signed in (caller keeps local cache). */
export async function pullRemote(): Promise<RemoteSnapshot | null> {
  return fetchAll()
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
