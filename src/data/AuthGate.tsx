import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Capacitor } from '@capacitor/core'
import { supabase, supabaseConfigured } from './supabaseClient'

type Status = 'checking' | 'signed-out' | 'signed-in' | 'link-sent'

// Must also be added to Supabase Dashboard -> Authentication -> URL Configuration -> Redirect
// URLs, and matches the intent-filter in android/app/src/main/AndroidManifest.xml.
const NATIVE_REDIRECT_URL = 'weighttracker://login-callback'

/** Gates the app behind Supabase magic-link auth. If Supabase isn't configured yet (no
 * .env.local), the app runs anyway in local-only mode — every data/api.ts call already checks
 * `supabaseConfigured` and no-ops, so this is a safe default for local development. */
export function AuthGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>(supabaseConfigured ? 'checking' : 'signed-in')
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!supabaseConfigured) return
    supabase.auth.getSession().then(({ data }: { data: { session: Session | null } }) => {
      setStatus(data.session ? 'signed-in' : 'signed-out')
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setStatus(session ? 'signed-in' : 'signed-out')
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  // Native only: the magic-link email opens weighttracker://login-callback?code=... directly
  // (see emailRedirectTo below) instead of a browser URL, so there's no page load for
  // supabase-js to auto-detect the session from — this listener is the deep-link equivalent.
  useEffect(() => {
    if (!supabaseConfigured || !Capacitor.isNativePlatform()) return
    let sub: { remove: () => void } | undefined
    void import('@capacitor/app').then(({ App }) => {
      App.addListener('appUrlOpen', ({ url }) => {
        if (!url.startsWith(NATIVE_REDIRECT_URL)) return
        const code = new URL(url).searchParams.get('code')
        if (!code) return
        void supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
          if (error) setError(error.message)
        })
      }).then((handle) => {
        sub = handle
      })
    })
    return () => sub?.remove()
  }, [])

  async function sendLink(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const emailRedirectTo = Capacitor.isNativePlatform() ? NATIVE_REDIRECT_URL : window.location.origin
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo } })
    if (error) setError(error.message)
    else setStatus('link-sent')
  }

  if (status === 'checking') return null
  if (status === 'signed-in') return <>{children}</>

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        padding: 24,
        gap: 16,
        textAlign: 'center',
      }}
    >
      <div
        style={{
          font: '700 25px/1 "Barlow Condensed", sans-serif',
          letterSpacing: '0.02em',
          textTransform: 'uppercase',
          color: 'var(--text-primary)',
        }}
      >
        Weight Tracker
      </div>
      {status === 'link-sent' ? (
        <p style={{ font: '500 11px "IBM Plex Mono", monospace', color: 'var(--text-muted)', maxWidth: 280 }}>
          Check your email for a sign-in link.
        </p>
      ) : (
        <form onSubmit={sendLink} style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%', maxWidth: 280 }}>
          <input
            type="email"
            required
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{
              padding: '12px 14px',
              borderRadius: 14,
              background: 'var(--surface)',
              border: '1.5px solid var(--divider)',
              font: '500 13px "IBM Plex Mono", monospace',
            }}
          />
          <button
            type="submit"
            style={{
              padding: '13px 0',
              borderRadius: 999,
              background: 'var(--lime)',
              color: '#0b0c0b',
              font: '700 13px/1 "Barlow Condensed", sans-serif',
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              cursor: 'pointer',
            }}
          >
            Send me a link
          </button>
          {error && (
            <p style={{ font: '500 10px "IBM Plex Mono", monospace', color: 'var(--red)' }}>{error}</p>
          )}
        </form>
      )}
    </div>
  )
}
