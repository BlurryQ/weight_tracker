import type { NutritionEntry } from '../lib/energy'
import type { Entry, PhaseLogEntry } from '../lib/math'
import { supabase, supabaseConfigured } from './supabaseClient'
import type { SettingsPayload } from './queue'

export interface RemoteSnapshot {
  entries: Entry[]
  nutrition: NutritionEntry[]
  phaseLog: PhaseLogEntry[]
  settings: SettingsPayload | null
}

async function requireSession() {
  const { data } = await supabase.auth.getSession()
  return data.session
}

// Supabase/PostgREST caps an unranged select at a project-configured max-rows (commonly 1000).
// Ordered ascending with no explicit range, an oversized table would silently come back
// truncated to its *oldest* rows — the newest entries (today's weigh-in included) would just
// vanish from the app with no error. Paginating explicitly makes fetchAll correct regardless of
// table size or that project setting, rather than depending on staying under it forever.
const FETCH_PAGE_SIZE = 1000

async function fetchAllRows<T>(table: string, columns: string, orderColumn: string): Promise<T[]> {
  const rows: T[] = []
  for (let offset = 0; ; offset += FETCH_PAGE_SIZE) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .order(orderColumn, { ascending: true })
      .range(offset, offset + FETCH_PAGE_SIZE - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    rows.push(...(data as T[]))
    if (data.length < FETCH_PAGE_SIZE) break
  }
  return rows
}

export async function upsertEntry(date: string, lbs: number): Promise<void> {
  if (!supabaseConfigured) return
  const { error } = await supabase.from('entries').upsert({ date, lbs }, { onConflict: 'user_id,date' })
  if (error) throw error
}

export async function deleteEntry(date: string): Promise<void> {
  if (!supabaseConfigured) return
  const { error } = await supabase.from('entries').delete().eq('date', date)
  if (error) throw error
}

export async function upsertDailyNutrition(date: string, kcal: number): Promise<void> {
  if (!supabaseConfigured) return
  const { error } = await supabase
    .from('daily_nutrition')
    .upsert({ date, kcal }, { onConflict: 'user_id,date' })
  if (error) throw error
}

export async function upsertPhaseLogEntry(start: string, name: PhaseLogEntry['name']): Promise<void> {
  if (!supabaseConfigured) return
  const { error } = await supabase.from('phase_log').upsert({ start, name }, { onConflict: 'user_id,start' })
  if (error) throw error
}

export async function upsertSettings(settings: SettingsPayload): Promise<void> {
  if (!supabaseConfigured) return
  const { error } = await supabase.from('settings').upsert(
    {
      phase: settings.phase,
      phase_start: settings.phaseStart,
      weekly_target: settings.weeklyTarget,
      unit: settings.unit,
      trend_window: settings.trendWindow,
      trend_window_mode: settings.trendWindowMode,
      solve_mode: settings.solveMode,
      target_lbs: settings.targetLbs,
      target_weeks: settings.targetWeeks,
    },
    { onConflict: 'user_id' },
  )
  if (error) throw error
}

/** Fetches entries + phase log + settings in parallel. Returns null if not configured or not
 * signed in yet (callers fall back to the local cache in that case). */
export async function fetchAll(): Promise<RemoteSnapshot | null> {
  if (!supabaseConfigured) return null
  const session = await requireSession()
  if (!session) return null

  const [entryRows, nutritionRows, phaseLogRows, settingsRes] = await Promise.all([
    fetchAllRows<{ date: string; lbs: number }>('entries', 'date, lbs', 'date'),
    fetchAllRows<{ date: string; kcal: number }>('daily_nutrition', 'date, kcal', 'date'),
    fetchAllRows<{ start: string; name: PhaseLogEntry['name'] }>('phase_log', 'start, name', 'start'),
    supabase.from('settings').select('*').maybeSingle(),
  ])
  if (settingsRes.error) throw settingsRes.error

  const settingsRow = settingsRes.data
  const settings: SettingsPayload | null = settingsRow
    ? {
        phase: settingsRow.phase,
        phaseStart: settingsRow.phase_start,
        weeklyTarget: settingsRow.weekly_target,
        unit: settingsRow.unit,
        trendWindow: settingsRow.trend_window,
        trendWindowMode: settingsRow.trend_window_mode,
        solveMode: settingsRow.solve_mode,
        targetLbs: settingsRow.target_lbs,
        targetWeeks: settingsRow.target_weeks,
      }
    : null

  return {
    entries: entryRows.map((r) => ({ date: r.date, lbs: r.lbs })),
    nutrition: nutritionRows.map((r) => ({ date: r.date, kcal: r.kcal })),
    phaseLog: phaseLogRows.map((r) => ({ start: r.start, name: r.name })),
    settings,
  }
}
