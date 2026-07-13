import { Navigate, Route, Routes } from 'react-router-dom'
import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { useAuth } from './lib/useAuth'
import { getSupabase } from './data/supabase'
import { LoginPage } from './features/auth/LoginPage'
import { AuthCallback } from './features/auth/AuthCallback'
import { HomePage } from './features/home/HomePage'

function Protected({ children }: { children: ReactNode }) {
  const { session, loading, user } = useAuth()
  useEffect(() => {
    if (user) {
      const s = getSupabase()
      s.from('profiles').upsert({ id: user.id }, { onConflict: 'id', ignoreDuplicates: true }).then(() => {})
    }
  }, [user])
  if (loading) return <p className="p-6">Loading…</p>
  return session ? <>{children}</> : <Navigate to="/login" replace />
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route path="/" element={<Protected><HomePage /></Protected>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
