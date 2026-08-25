import type { Entry, PhaseLogEntry } from '../lib/math'
import { supabase, supabaseConfigured } from './supabaseClient'
import type { SettingsPayload } from './queue'

export interface RemoteSnapshot {
  entries: Entry[]
  phaseLog: PhaseLogEntry[]
  settings: SettingsPayload | null
}

async function requireSession() {
  const { data } = await supabase.auth.getSession()
  return data.session
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
      trend_horizon: settings.trendHorizon,
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

  const [entriesRes, phaseLogRes, settingsRes] = await Promise.all([
    supabase.from('entries').select('date, lbs').order('date', { ascending: true }),
    supabase.from('phase_log').select('start, name').order('start', { ascending: true }),
    supabase.from('settings').select('*').maybeSingle(),
  ])
  if (entriesRes.error) throw entriesRes.error
  if (phaseLogRes.error) throw phaseLogRes.error
  if (settingsRes.error) throw settingsRes.error

  const settingsRow = settingsRes.data
  const settings: SettingsPayload | null = settingsRow
    ? {
        phase: settingsRow.phase,
        phaseStart: settingsRow.phase_start,
        weeklyTarget: settingsRow.weekly_target,
        unit: settingsRow.unit,
        trendWindow: settingsRow.trend_window,
        trendHorizon: settingsRow.trend_horizon,
        solveMode: settingsRow.solve_mode,
        targetLbs: settingsRow.target_lbs,
        targetWeeks: settingsRow.target_weeks,
      }
    : null

  return {
    entries: (entriesRes.data ?? []).map((r) => ({ date: r.date, lbs: r.lbs })),
    phaseLog: (phaseLogRes.data ?? []).map((r) => ({ start: r.start, name: r.name })),
    settings,
  }
}
