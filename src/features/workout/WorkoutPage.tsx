import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { AppShell } from '../../components/ui/AppShell'
import { Button } from '../../components/ui/Button'
import { useAuth } from '../../lib/useAuth'
import { useActiveWorkout } from '../../data/queries'
import type { ActiveWorkoutBundle } from '../../data/queries'
import { useSaveWorkout } from '../../data/mutations'
import type { WorkoutSessionInput, WorkoutSetInput } from '../../data/mutations'
import { detectStrengthPRs, sessionTonnage } from '../../domain'
import type { LoggedSet, PersonalRecord, PrType } from '../../domain'
import { ExerciseCard } from './ExerciseCard'
import { SummarySheet } from './SummarySheet'
import type { SummarySheetProps } from './SummarySheet'
import { useSessionStore } from './sessionStore'

/** Maps exerciseName -> exercise_id using the active-program bundle, since
 *  the session store's own `exerciseId` is never populated (sets are keyed
 *  by name during logging, but the DB needs the real exercise row id). */
function buildExerciseIdMap(bundle: ActiveWorkoutBundle): Record<string, string> {
  const map: Record<string, string> = {}
  for (const pe of bundle.programExercises) {
    if (!pe.exercise_id) continue
    const name = bundle.exercisesById[pe.exercise_id]?.name
    if (name) map[name] = pe.exercise_id
  }
  return map
}

/** Maps the bundle's DB-shaped personal_records rows to the domain
 *  `PersonalRecord` shape `detectStrengthPRs` expects (keyed by exerciseName). */
function mapExistingPRs(bundle: ActiveWorkoutBundle): PersonalRecord[] {
  const out: PersonalRecord[] = []
  for (const row of bundle.personalRecords) {
    const name = row.exercise_id ? bundle.exercisesById[row.exercise_id]?.name : undefined
    if (!name) continue
    out.push({ exerciseName: name, prType: row.pr_type as PrType, value: row.value })
  }
  return out
}

type Summary = Omit<SummarySheetProps, 'onClose'>

/** Active-session logging screen: one ExerciseCard per exercise plus a
 *  sticky "Finish workout" action. Redirects Home when there's no active
 *  session (e.g. a deep link to /workout without starting one first). */
export function WorkoutPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { data: bundle } = useActiveWorkout(user?.id)
  const saveWorkout = useSaveWorkout()

  const status = useSessionStore((s) => s.status)
  const clientId = useSessionStore((s) => s.clientId)
  const sessionType = useSessionStore((s) => s.sessionType)
  const dayName = useSessionStore((s) => s.dayName)
  const exercises = useSessionStore((s) => s.exercises)
  const reset = useSessionStore((s) => s.reset)

  const [summary, setSummary] = useState<Summary | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  if (status !== 'active') {
    return <Navigate to="/" replace />
  }

  function handleFinish() {
    if (!bundle || !clientId) {
      setErrorMsg('Still loading your program — please wait a moment and try again.')
      return
    }
    setErrorMsg(null)

    const exerciseIdByName = buildExerciseIdMap(bundle)

    const loggedSets: LoggedSet[] = []
    const sets: WorkoutSetInput[] = []
    let orderIndex = 0

    for (const exercise of exercises) {
      exercise.sets.forEach((set, setIdx) => {
        if (set.weight == null || set.reps == null) return
        loggedSets.push({ exerciseName: exercise.exerciseName, weight: set.weight, reps: set.reps })
        sets.push({
          exercise_id: exercise.exerciseId ?? exerciseIdByName[exercise.exerciseName] ?? null,
          set_number: setIdx + 1,
          weight: set.weight,
          reps: set.reps,
          rpe: null,
          is_warmup: false,
          order_index: orderIndex++,
        })
      })
    }

    const tonnage = sessionTonnage(loggedSets)
    const exerciseCount = new Set(loggedSets.map((s) => s.exerciseName)).size
    const prs = detectStrengthPRs(loggedSets, mapExistingPRs(bundle))

    const session: WorkoutSessionInput = {
      discipline: 'strength',
      session_type: dayName ?? sessionType ?? undefined,
      date: new Date().toISOString().slice(0, 10),
      program_variant: bundle.program.name,
      program_week: bundle.cursor.week,
      status: 'completed',
    }

    saveWorkout.mutate(
      { clientId, session, sets, program: bundle.program, cursor: bundle.cursor },
      {
        onSuccess: () => {
          setSummary({ tonnage, setCount: loggedSets.length, exerciseCount, prs })
        },
        onError: (err) => {
          setErrorMsg(err.message || 'Could not save your workout. Please try again.')
        },
      },
    )
  }

  function handleSummaryClose() {
    setSummary(null)
    reset()
    navigate('/')
  }

  return (
    <>
      <AppShell title={dayName ?? 'Workout'}>
        <div className="space-y-4 pb-24">
          {exercises.map((exercise, exIdx) => (
            <ExerciseCard key={exIdx} exIdx={exIdx} exercise={exercise} />
          ))}
        </div>

        <div
          className="fixed inset-x-0 bottom-0 border-t border-border bg-bg/95 p-4 backdrop-blur-sm"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1rem)' }}
        >
          {errorMsg ? (
            <p role="alert" className="mb-2 text-sm text-danger">
              {errorMsg}
            </p>
          ) : null}
          <Button fullWidth onClick={handleFinish} disabled={saveWorkout.isPending}>
            {saveWorkout.isPending ? 'Saving…' : 'Finish workout'}
          </Button>
        </div>
      </AppShell>

      {summary ? <SummarySheet {...summary} onClose={handleSummaryClose} /> : null}
    </>
  )
}
