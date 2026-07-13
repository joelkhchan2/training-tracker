import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getSupabase } from '../../data/supabase'
import { useAuth } from '../../lib/useAuth'

const DISCIPLINES = ['strength','climbing','cardio','calisthenics'] as const

export function OnboardingPage() {
  const { user } = useAuth()
  const nav = useNavigate()
  const [units, setUnits] = useState<'lbs'|'kg'>('lbs')
  const [enabled, setEnabled] = useState<string[]>(['strength'])

  async function finish() {
    if (!user) return
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
    await getSupabase().from('profiles').update({
      units, timezone: tz, enabled_disciplines: enabled, onboarding_complete: true,
    }).eq('id', user.id)
    nav('/', { replace: true })
  }

  return (
    <main className="p-6 space-y-4 max-w-md mx-auto">
      <h1 className="text-lg font-semibold">Set up your tracker</h1>
      <label className="block">Units
        <select value={units} onChange={e => setUnits(e.target.value as 'lbs'|'kg')}
          className="mt-1 block border rounded p-2">
          <option value="lbs">lbs</option><option value="kg">kg</option>
        </select>
      </label>
      <fieldset className="space-y-1">
        <legend>Disciplines</legend>
        {DISCIPLINES.map(d => (
          <label key={d} className="flex gap-2 items-center">
            <input type="checkbox" checked={enabled.includes(d)}
              onChange={e => setEnabled(s => e.target.checked ? [...s, d] : s.filter(x => x !== d))} />
            {d}
          </label>
        ))}
      </fieldset>
      <button onClick={finish} disabled={enabled.length === 0}
        className="rounded-lg px-4 py-2 bg-black text-white disabled:opacity-40">Finish</button>
    </main>
  )
}
