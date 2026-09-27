import { supabase } from '../lib/supabaseClient'

// Date of birth + gender ride along in the sign-up metadata; the app copies them into the
// private details table on first sign-in (they are never put on the public profile)
export const signUp = (email, password, fullName, birthDate, gender) =>
  supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName, birth_date: birthDate || null, gender: gender || null } },
  })

export const signIn = (email, password) => supabase.auth.signInWithPassword({ email, password })

export const signOut = () => supabase.auth.signOut()
