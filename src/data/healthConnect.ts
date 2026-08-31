import { Capacitor, registerPlugin } from '@capacitor/core'
import { addDays, today } from '../lib/dates'
import type { NutritionEntry } from '../lib/energy'
import type { Action } from '../store/reducer'

/** Days of history re-read from Health Connect on each app open. Health Connect only retains
 * ~30 days on-device; older days come from the one-time MyFitnessPal backfill in Supabase. */
const LOOKBACK_DAYS = 35

/** Bridge to the local Kotlin plugin (android/app/src/main/java/.../HealthConnectPlugin.kt).
 * On web/iOS the proxy exists but every call rejects — callers gate on healthConnectSupported()
 * first, so those rejections are never hit in practice. */
interface HealthConnectNative {
  isAvailable(): Promise<{ available: boolean }>
  hasPermission(): Promise<{ granted: boolean }>
  requestPermission(): Promise<{ granted: boolean }>
  readDailyCalories(opts: { startDate: string; endDate: string }): Promise<{
    days: { date: string; kcal: number }[]
  }>
}

const HealthConnect = registerPlugin<HealthConnectNative>('HealthConnect')

/** Health Connect is Android-only. On web/PWA/iOS every function here is an inert no-op and the
 * calories feature simply shows "not connected". */
export function healthConnectSupported(): boolean {
  return Capacitor.getPlatform() === 'android'
}

export async function isCalorieAccessGranted(): Promise<boolean> {
  if (!healthConnectSupported()) return false
  try {
    if (!(await HealthConnect.isAvailable()).available) return false
    return (await HealthConnect.hasPermission()).granted
  } catch {
    return false
  }
}

export async function requestCalorieAccess(): Promise<boolean> {
  if (!healthConnectSupported()) return false
  try {
    if (!(await HealthConnect.isAvailable()).available) return false
    return (await HealthConnect.requestPermission()).granted
  } catch {
    return false
  }
}

async function readDailyCaloriesFromDevice(fromIso: string, toIso: string): Promise<NutritionEntry[]> {
  const { days } = await HealthConnect.readDailyCalories({ startDate: fromIso, endDate: toIso })
  return days
    .map((d) => ({ date: d.date, kcal: Math.round(d.kcal) }))
    .filter((d) => d.kcal > 0)
}

/** Reads recent daily calorie totals from Health Connect and dispatches only the days whose
 * total differs from what's already in the store — keeps the offline write queue small on a
 * resume where nothing changed. No-op off Android or before access is granted. */
export async function syncHealthConnect(
  current: NutritionEntry[],
  dispatch: (action: Action) => void,
): Promise<void> {
  if (!healthConnectSupported()) return
  if (!(await isCalorieAccessGranted())) return

  const to = today()
  const from = addDays(to, -(LOOKBACK_DAYS - 1))

  let fresh: NutritionEntry[]
  try {
    fresh = await readDailyCaloriesFromDevice(from, to)
  } catch {
    return // Health Connect unavailable / permission revoked mid-session — try again next resume.
  }

  const byDate = new Map(current.map((n) => [n.date, n.kcal]))
  const changed = fresh.filter((n) => byDate.get(n.date) !== n.kcal)
  if (changed.length) dispatch({ type: 'MERGE_NUTRITION', entries: changed })
}
