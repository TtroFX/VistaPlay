import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { PersistedAppState } from '../domain/types'

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

export async function syncState(local: PersistedAppState): Promise<PersistedAppState> {
  const supabase = getSupabase()
  if (!supabase) throw new Error('Supabase connection is not configured')
  const { data: auth } = await supabase.auth.getUser()
  const user = auth.user
  if (!user) throw new Error('Sign in before enabling cloud sync')
  const { data: remote, error: readError } = await supabase.from('user_state').select('payload,revision,updated_at').eq('user_id', user.id).maybeSingle()
  if (readError) throw readError
  let winner = local
  if (remote?.payload && Number(remote.revision) > local.revision) winner = remote.payload as PersistedAppState
  const outgoing = { ...winner, revision: Math.max(winner.revision, Number(remote?.revision ?? 0)) + 1, updatedAt: new Date().toISOString() }
  const { error } = await supabase.from('user_state').upsert({ user_id: user.id, payload: outgoing, revision: outgoing.revision, updated_at: outgoing.updatedAt })
  if (error) throw error
  return outgoing
}
