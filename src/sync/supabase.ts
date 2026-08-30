import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { PersistedAppState } from '../domain/types'
import { mergeCloudStates, prepareCloudState } from './conflicts'

let client: SupabaseClient | undefined

export function getSupabase(): SupabaseClient | undefined {
  const url = import.meta.env.VITE_SUPABASE_URL
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY
  if (!url || !anon || typeof window === 'undefined') return undefined
  client ??= createClient(url, anon, { auth: { storage: window.sessionStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
  return client
}

export async function signInWithGoogle(): Promise<void> {
  const supabase = getSupabase()
  if (!supabase) throw new Error('Supabase connection is not configured')
  const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin + '/settings/connections', scopes: 'https://www.googleapis.com/auth/youtube.readonly' } })
  if (error) throw error
}

export async function signOutCloud(): Promise<void> {
  const supabase = getSupabase()
  if (supabase) await supabase.auth.signOut()
}

export async function getGoogleAccessToken(): Promise<string | undefined> {
  const supabase = getSupabase()
  if (!supabase) return undefined
  const { data } = await supabase.auth.getSession()
  return data.session?.provider_token ?? undefined
}

export async function syncState(local: PersistedAppState): Promise<PersistedAppState> {
  const supabase = getSupabase()
  if (!supabase) throw new Error('Supabase connection is not configured')
  const { data: auth } = await supabase.auth.getUser()
  const user = auth.user
  if (!user) throw new Error('Sign in before enabling cloud sync')
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { data: remote, error: readError } = await supabase.from('user_state').select('payload,revision,updated_at').eq('user_id', user.id).maybeSingle()
    if (readError) throw readError
    const merged = remote?.payload ? mergeCloudStates(local, remote.payload as PersistedAppState) : local
    const now = new Date().toISOString()
    const next = { ...merged, revision: Math.max(merged.revision, Number(remote?.revision ?? 0)) + 1, updatedAt: now }
    const payload = prepareCloudState(next)
    if (!remote) {
      const { error } = await supabase.from('user_state').insert({ user_id: user.id, payload, revision: next.revision, updated_at: now })
      if (!error) return next
      if (error.code === '23505') continue
      throw error
    }
    const { data: updated, error } = await supabase.from('user_state').update({ payload, revision: next.revision, updated_at: now }).eq('user_id', user.id).eq('revision', remote.revision).select('revision').maybeSingle()
    if (error) throw error
    if (updated) return next
  }
  throw new Error('Cloud state changed during sync. Try again.')
}
