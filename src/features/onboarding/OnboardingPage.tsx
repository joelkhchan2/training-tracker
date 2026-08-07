import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getSupabase } from '../../data/supabase'
import { useAuth } from '../../lib/useAuth'
import { usePrefs } from '../settings/usePrefs'
import { unitsToWeightUnit } from '../settings/prefs'

const DISCIPLINES = ['strength','climbing','cardio','calisthenics'] as const

export function OnboardingPage() {
  const { user } = useAuth()
  const nav = useNavigate()
  const [units, setUnits] = useState<'lbs'|'kg'>('lbs')
  const [enabled, setEnabled] = useState<string[]>(['strength'])

  async function finish() {
    if (!user) return
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
    // Reconcile the chosen unit into weightUnit (via the single lbs->lb mapping site) and update
    // the local store immediately — a brand-new kg user must be correct on this load, not just
    // after the next login's hydrate seed. This write also lands *before* onboarding_complete
    // flips true, so usePrefsSync (gated on onboarding_complete) can't race it — see Task 3/4.
    usePrefs.getState().setWeightUnit(unitsToWeightUnit(units))
    const {
      setTheme, setFontFamily, setFontScale, setWeightUnit,
      setWeekStartDay, setRestTimerDefaultSeconds, setRestTimerHaptics, setShowRpe, setAutoFillSets, setAutoFillForExercise,
      ...ui_prefs
    } = usePrefs.getState()
    await getSupabase().from('profiles').update({
      units, timezone: tz, enabled_disciplines: enabled, onboarding_complete: true, ui_prefs,
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
