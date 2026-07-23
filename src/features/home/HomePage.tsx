import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../lib/useAuth'
import { useActiveWorkout } from '../../data/queries'
import { fetchLastSetsByExercise, applyAutofill, buildTodayExerciseIdMap } from '../../data/exerciseHistory'
import { AppShell } from '../../components/ui/AppShell'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { useTodaysPrescription } from '../workout/useTodaysPrescription'
import { useSessionStore } from '../workout/sessionStore'
import type { PrescribedSet } from '../../domain/types'

/** Compact, readable summary of a prescribed exercise's sets, e.g.
 *  "6×5 @ 135/155/175" or "3×5" for a scheme with no assigned weight.
 *  Consecutive sets sharing a rep count are grouped together. */
function formatSetsHint(sets: PrescribedSet[]): string {
  const groups: { reps: number; count: number; weights: number[] }[] = []
  for (const s of sets) {
    const last = groups[groups.length - 1]
    if (last && last.reps === s.reps) {
      last.count += 1
      if (s.weight != null) last.weights.push(s.weight)
    } else {
      groups.push({ reps: s.reps, count: 1, weights: s.weight != null ? [s.weight] : [] })
    }
  }
  return groups
    .map(g => {
      const weightPart = g.weights.length > 0 ? ` @ ${[...new Set(g.weights)].join('/')}` : ''
      return `${g.count}×${g.reps}${weightPart}`
    })
    .join(', ')
}

export function HomePage() {
  const { signOut, user } = useAuth()
  const nav = useNavigate()
  const startFromPrescription = useSessionStore(s => s.startFromPrescription)
  const { loading, hasProgram, dayName, dayIndex, label, prescription } = useTodaysPrescription()
  const { data: bundle } = useActiveWorkout(user?.id)
  const [starting, setStarting] = useState(false)

  const signOutLink = (
    <button onClick={signOut} className="text-sm text-muted underline">
      Sign out
    </button>
  )

  async function handleStart() {
    setStarting(true)
    const clientId = crypto.randomUUID()
    const startedAt = new Date().toISOString()
    const meta = { sessionType: dayName, dayName, dayIndex, clientId, startedAt }
    try {
      let toStart = prescription
      if (bundle && user) {
        const todayMap = buildTodayExerciseIdMap(bundle)
        const ids = prescription
          .map((ex) => todayMap[ex.exerciseName])
          .filter((id): id is string => !!id)
        if (ids.length > 0) {
          const byId = await fetchLastSetsByExercise(ids, user.id)
          const byName: Record<string, { weight: number | null; reps: number | null }[]> = {}
          for (const ex of prescription) {
            const id = todayMap[ex.exerciseName]
            if (id && byId[id]) byName[ex.exerciseName] = byId[id]
          }
          toStart = applyAutofill(prescription, byName)
        }
      }
      startFromPrescription(toStart, meta)
      nav('/workout')
    } catch {
      // Autofill failed — don't block the workout, start with the un-autofilled prescription.
      startFromPrescription(prescription, meta)
      nav('/workout')
    } finally {
      setStarting(false)
    }
  }

  if (loading) {
    return (
      <AppShell title="Home" right={signOutLink}>
        <p className="text-muted">Loading…</p>
      </AppShell>
    )
  }

  if (!hasProgram) {
    return (
      <AppShell title="Home" right={signOutLink}>
        <Card className="space-y-3">
          <h2 className="text-lg font-semibold text-text">No active program yet</h2>
          <p className="text-sm text-muted">Pick a program to get started.</p>
          <Button fullWidth onClick={() => nav('/programs')}>
            Choose a program
          </Button>
        </Card>
      </AppShell>
    )
  }

  return (
    <AppShell title="Home" right={signOutLink}>
      <div className="space-y-4">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-sm font-medium text-muted">{label}</p>
          <Button variant="ghost" size="sm" onClick={() => nav('/programs')}>
            Change program
          </Button>
        </div>

        <Card className="space-y-3">
          {prescription.map((ex, i) => (
            <div key={`${ex.exerciseName}-${i}`} className="flex items-baseline justify-between gap-3">
              <span className="font-medium text-text">{ex.exerciseName}</span>
              <span className="text-sm text-muted">{formatSetsHint(ex.sets)}</span>
            </div>
          ))}
        </Card>

        <Button fullWidth onClick={handleStart} disabled={starting}>
          {starting ? 'Starting…' : 'Start workout'}
        </Button>
      </div>
    </AppShell>
  )
}
