import { createContext } from 'react'
import type { Session, User } from '@supabase/supabase-js'

export type AuthValue = {
  session: Session | null; user: User | null; loading: boolean
  signInWithGoogle: () => Promise<void>; signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthValue | null>(null)
