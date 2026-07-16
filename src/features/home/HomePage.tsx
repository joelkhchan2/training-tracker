import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../lib/useAuth'
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
  const { signOut } = useAuth()
  const nav = useNavigate()
  const startFromPrescription = useSessionStore(s => s.startFromPrescription)
  const { loading, hasProgram, dayName, dayIndex, label, prescription } = useTodaysPrescription()

  const signOutLink = (
    <button onClick={signOut} className="text-sm text-muted underline">
      Sign out
    </button>
  )

  function handleStart() {
    const clientId = crypto.randomUUID()
    const startedAt = new Date().toISOString()
    startFromPrescription(prescription, {
      sessionType: dayName,
      dayName,
      dayIndex,
      clientId,
      startedAt,
    })
    nav('/workout')
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
        <Card>
          <h2 className="text-lg font-semibold text-text">No active program yet</h2>
          <p className="mt-2 text-sm text-muted">
            No active program yet — program builder is coming soon.
          </p>
        </Card>
      </AppShell>
    )
  }

  return (
    <AppShell title="Home" right={signOutLink}>
      <div className="space-y-4">
        <p className="text-sm font-medium text-muted">{label}</p>

        <Card className="space-y-3">
          {prescription.map((ex, i) => (
            <div key={`${ex.exerciseName}-${i}`} className="flex items-baseline justify-between gap-3">
              <span className="font-medium text-text">{ex.exerciseName}</span>
              <span className="text-sm text-muted">{formatSetsHint(ex.sets)}</span>
            </div>
          ))}
        </Card>

        <Button fullWidth onClick={handleStart}>
          Start workout
        </Button>
      </div>
    </AppShell>
  )
}
