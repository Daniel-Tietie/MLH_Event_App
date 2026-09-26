import { supabase } from '../lib/supabaseClient'

export const signUp = (email, password, fullName) =>
  supabase.auth.signUp({ email, password, options: { data: { full_name: fullName } } })

export const signIn = (email, password) => supabase.auth.signInWithPassword({ email, password })

export const signOut = () => supabase.auth.signOut()
