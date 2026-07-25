import { useNavigate } from 'react-router-dom'
import { AppShell } from '../../components/ui/AppShell'
import { Card } from '../../components/ui/Card'
import { useAuth } from '../../lib/useAuth'
import { usePersonalRecords } from '../../data/personalRecords'
import type { StrengthRecord } from '../../data/personalRecords'

function RecordCard({ r }: { r: StrengthRecord }) {
  const e1rm = r.bestE1rm > 0
    ? `e1RM ${r.bestE1rm}${r.bestE1rmWeight != null && r.bestE1rmReps != null ? ` · ${r.bestE1rmWeight}×${r.bestE1rmReps}` : ''}`
    : null
  const vol = r.bestVolume > 0 ? `vol ${r.bestVolume}` : null
  const detail = [e1rm, vol].filter(Boolean).join('  ·  ')
  return (
    <Card>
      <p className="font-medium text-text">{r.exerciseName}</p>
      {detail ? <p className="text-sm text-muted">{detail}</p> : null}
    </Card>
  )
}

export function ProgressPage() {
  const { user } = useAuth()
  const nav = useNavigate()
  const { data, isLoading, isError } = usePersonalRecords(user?.id)

  const strength = data?.strength ?? []
  const climbing = data?.climbingMaxGrade ?? null
  const empty = strength.length === 0 && climbing == null

  return (
    <AppShell title="Progress">
      <div className="space-y-6">
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-text">Personal records</h2>
          {isLoading ? (
            <p className="text-muted">Loading…</p>
          ) : isError ? (
            <p role="alert" className="text-sm text-danger">Could not load your records. Please try again.</p>
          ) : empty ? (
            <Card><p className="text-muted">Log some workouts to see your records here.</p></Card>
          ) : (
            <>
              {strength.map(r => <RecordCard key={r.exerciseId} r={r} />)}
              {climbing != null ? (
                <Card>
                  <p className="font-medium text-text">Climbing</p>
                  <p className="text-sm text-muted">max V{climbing}</p>
                </Card>
              ) : null}
            </>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-text">Tools</h2>
          <button type="button" onClick={() => nav('/progress/calculator')} className="block w-full text-left">
            <Card>
              <p className="font-medium text-text">1RM Calculator</p>
              <p className="text-sm text-muted">Estimate your one-rep max and training loads</p>
            </Card>
          </button>
        </section>
      </div>
    </AppShell>
  )
}
