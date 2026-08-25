import { PERSISTED_KEYS, type PersistedState } from '../store/types'

const CACHE_KEY = 'wt.v1'

export function saveSnapshot(state: PersistedState): void {
  try {
    const snapshot = {} as PersistedState
    for (const key of PERSISTED_KEYS) {
      // @ts-expect-error -- copying a known-matching key/value pair between identically typed objects
      snapshot[key] = state[key]
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(snapshot))
  } catch {
    // localStorage can throw (private mode, quota) — the in-memory state is still correct,
    // it just won't survive a reload. Nothing else to do here.
  }
}

export function loadSnapshot(): Partial<PersistedState> | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as Partial<PersistedState>
  } catch {
    return null
  }
}
