import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useAuth } from './lib/useAuth'
import { getSupabase } from './data/supabase'
import { LoginPage } from './features/auth/LoginPage'
import { AuthCallback } from './features/auth/AuthCallback'
import { HomePage } from './features/home/HomePage'
import { OnboardingPage } from './features/onboarding/OnboardingPage'
import { WorkoutPage } from './features/workout/WorkoutPage'
import { ProgramsPage } from './features/programs/ProgramsPage'
import { BuilderPage } from './features/programs/BuilderPage'

function Protected({ children }: { children: ReactNode }) {
  const { session, loading, user } = useAuth()
  const location = useLocation()
  const [onboarded, setOnboarded] = useState<boolean | null>(null)

  useEffect(() => {
    if (!user) return
    let active = true
    const s = getSupabase()
    ;(async () => {
      await s.from('profiles').upsert({ id: user.id }, { onConflict: 'id', ignoreDuplicates: true })
      const { data } = await s.from('profiles').select('onboarding_complete').eq('id', user.id).single()
      if (active) setOnboarded(Boolean(data?.onboarding_complete))
    })()
    return () => {
      active = false
    }
  }, [user])

  if (loading) return <p className="p-6">Loading…</p>
  if (!session) return <Navigate to="/login" replace />
  if (onboarded === null) return <p className="p-6">Loading…</p>
  if (!onboarded && location.pathname !== '/onboarding') return <Navigate to="/onboarding" replace />
  return <>{children}</>
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route path="/onboarding" element={<Protected><OnboardingPage /></Protected>} />
      <Route path="/" element={<Protected><HomePage /></Protected>} />
      <Route path="/workout" element={<Protected><WorkoutPage /></Protected>} />
      <Route path="/programs" element={<Protected><ProgramsPage /></Protected>} />
      <Route path="/programs/new" element={<Protected><BuilderPage /></Protected>} />
      <Route path="/programs/:id/edit" element={<Protected><BuilderPage /></Protected>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
