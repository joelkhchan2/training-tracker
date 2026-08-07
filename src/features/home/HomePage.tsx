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
import { formatSetsHint } from './formatSetsHint'
import { usePrefs } from '../settings/usePrefs'
import { useAdvanceCursor, useSetCursorDay } from '../../data/cursorActions'

export function HomePage() {
  const { signOut, user } = useAuth()
  const nav = useNavigate()
  const startFromPrescription = useSessionStore(s => s.startFromPrescription)
  const { loading, hasProgram, dayName, dayIndex, label, prescription, discipline, target } = useTodaysPrescription()
  const { data: bundle } = useActiveWorkout(user?.id)
  const weightUnit = usePrefs(s => s.weightUnit)
  const [starting, setStarting] = useState(false)
  const advanceCursorMut = useAdvanceCursor()
  const setCursorDayMut = useSetCursorDay()
  const [picking, setPicking] = useState(false)

  // An in-progress session persisted in the store (survives navigating away and app restarts).
  // Its presence flips "Start workout" into a resume-or-start-new choice so a re-seed can never
  // silently wipe logged-but-unsaved inputs.
  const sessionStatus = useSessionStore(s => s.status)
  const sessionExercises = useSessionStore(s => s.exercises)
  const sessionDayName = useSessionStore(s => s.dayName)
  const hasActiveSession = sessionStatus === 'active' && sessionExercises.length > 0
  const enteredSetCount = sessionExercises.reduce(
    (n, ex) => n + ex.sets.filter(s => s.done || s.weight != null || s.reps != null || s.durationSeconds != null).length,
    0,
  )
  const [confirmingStartNew, setConfirmingStartNew] = useState(false)

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

        {hasActiveSession ? (
          <Card className="space-y-3 border-accent">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold text-text">Workout in progress</h2>
              <p className="text-sm text-muted">
                {sessionDayName || 'Workout'}
                {enteredSetCount > 0 ? ` · ${enteredSetCount} set${enteredSetCount === 1 ? '' : 's'} entered` : ''}
              </p>
            </div>
            <Button fullWidth onClick={() => nav('/workout')}>
              Resume workout
            </Button>
          </Card>
        ) : null}

        {discipline === 'strength' ? (
          <>
            <Card className="space-y-3">
              {prescription.map((ex, i) => (
                <div key={`${ex.exerciseName}-${i}`} className="flex items-baseline justify-between gap-3">
                  <span className="font-medium text-text">{ex.exerciseName}</span>
                  <span className="text-sm text-muted">{formatSetsHint(ex.sets, weightUnit)}</span>
                </div>
              ))}
            </Card>

            {hasActiveSession ? (
              confirmingStartNew ? (
                <Card className="space-y-3">
                  <p className="text-sm text-text">Start a new workout? Your in-progress workout will be discarded.</p>
                  <div className="flex gap-2">
                    <Button variant="secondary" fullWidth onClick={() => setConfirmingStartNew(false)}>
                      Cancel
                    </Button>
                    <Button fullWidth onClick={handleStart} disabled={starting}>
                      {starting ? 'Starting…' : 'Discard & start new'}
                    </Button>
                  </div>
                </Card>
              ) : (
                <Button variant="secondary" fullWidth onClick={() => setConfirmingStartNew(true)}>
                  Start new workout
                </Button>
              )
            ) : (
              <Button fullWidth onClick={handleStart} disabled={starting}>
                {starting ? 'Starting…' : 'Start workout'}
              </Button>
            )}
          </>
        ) : (
          <>
            <Card className="space-y-2">
              <p className="font-medium capitalize text-text">{discipline}</p>
              {target ? <p className="text-sm text-muted">{target}</p> : null}
            </Card>

            <Button
              fullWidth
              onClick={() =>
                nav(discipline === 'climbing' ? '/climbing/new' : '/cardio/new', { state: { programLinked: true } })
              }
            >
              {discipline === 'climbing' ? 'Start climbing' : 'Start cardio'}
            </Button>
          </>
        )}

        {bundle ? (
          <div className="space-y-2 border-t border-border pt-4">
            <div className="flex gap-2">
              <Button variant="secondary" fullWidth onClick={() => advanceCursorMut.mutate({ program: bundle.program, cursor: bundle.cursor })} disabled={advanceCursorMut.isPending}>
                Skip day
              </Button>
              <Button variant="secondary" fullWidth onClick={() => setPicking(v => !v)}>
                Do a different day
              </Button>
            </div>
            {picking ? (
              <Card className="space-y-2">
                {bundle.program.days.map((d, i) => (
                  <Button
                    key={`${d.name}-${i}`}
                    variant="ghost"
                    fullWidth
                    onClick={() => { setCursorDayMut.mutate({ cursor: bundle.cursor, dayIndex: i }); setPicking(false) }}
                  >
                    {d.name}
                  </Button>
                ))}
              </Card>
            ) : null}
          </div>
        ) : null}
      </div>
    </AppShell>
  )
}
