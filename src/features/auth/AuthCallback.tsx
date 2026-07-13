import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../lib/useAuth'
export function AuthCallback() {
  const { session, loading } = useAuth()
  const nav = useNavigate()
  useEffect(() => { if (!loading) nav(session ? '/' : '/login', { replace: true }) }, [loading, session, nav])
  return <p className="p-6">Signing you in…</p>
}
