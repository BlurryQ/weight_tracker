import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const supabaseConfigured = Boolean(url && anonKey)

// Falls back to placeholder values so the client can always be constructed — every call site
// checks `supabaseConfigured` first and skips network access entirely when it's false, so the
// app runs fully offline (local cache only) until real credentials are provided in .env.local.
//
// PKCE flow is required for the native deep-link callback (weighttracker://login-callback,
// see AuthGate.tsx): the magic-link email carries a `code` param that gets exchanged for a
// session via exchangeCodeForSession(url) once Android hands the URL back to the app.
export const supabase = createClient(url || 'https://placeholder.supabase.co', anonKey || 'placeholder-anon-key', {
  auth: { flowType: 'pkce' },
})
