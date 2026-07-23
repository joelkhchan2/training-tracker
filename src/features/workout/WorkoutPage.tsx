import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors } from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { AppShell } from '../../components/ui/AppShell'
import { Button } from '../../components/ui/Button'
import { useAuth } from '../../lib/useAuth'
import { useActiveWorkout } from '../../data/queries'
import type { ActiveWorkoutBundle } from '../../data/queries'
import { useSaveWorkout } from '../../data/mutations'
import type { ProgressionExerciseInput, SaveWorkoutResult, WorkoutSessionInput, WorkoutSetInput } from '../../data/mutations'
import { resolveExercisesByName } from '../../data/resolveDraftExercises'
import { buildTodayExerciseIdMap, fetchLastSetsByExercise } from '../../data/exerciseHistory'
import { detectStrengthPRs, sessionTonnage } from '../../domain'
import type { LoggedSet, PersonalRecord, PrType } from '../../domain'
import { ExerciseCard } from './ExerciseCard'
import { ExercisePickerSheet } from './ExercisePickerSheet'
import { RestTimerPill } from './RestTimerPill'
import { SessionMetaCard } from './SessionMetaCard'
import { SessionTimer } from './SessionTimer'
import { SummarySheet } from './SummarySheet'
import type { ProgressionOutcomeDisplay, SummarySheetProps } from './SummarySheet'
import { useRestTimer } from './restTimer'
import { useSessionStore } from './sessionStore'
import { reorderFromDragEnd } from './dragReorder'

/** Formats a Date as a local-calendar YYYY-MM-DD string. Using
 *  `toISOString().slice(0, 10)` would report the UTC date, which flips to
 *  "tomorrow" for anyone logging a workout late at night in a timezone
 *  behind UTC. */
function localDateString(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

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

/** Builds `useSaveWorkout`'s `progressionExercises` input: every linear-scheme exercise on
 *  today's program day, resolved to its real `exercise_id` via `exerciseIdByName`. Exercises
 *  with no resolvable id (shouldn't happen for a real linear lift, which always has one) are
 *  skipped — `buildProgressionUpdates` needs a real id to match logged sets against. */
function buildProgressionExercises(
  bundle: ActiveWorkoutBundle,
  exerciseIdByName: Record<string, string>,
): ProgressionExerciseInput[] {
  const day = bundle.program.days[bundle.cursor.dayIndex]
  const out: ProgressionExerciseInput[] = []
  for (const ex of day?.exercises ?? []) {
    if (ex.scheme.type !== 'linear') continue
    const exerciseId = exerciseIdByName[ex.exerciseName]
    if (!exerciseId) continue
    out.push({ exerciseId, exerciseName: ex.exerciseName, tmKey: ex.tmKey, scheme: ex.scheme })
  }
  return out
}

/** Per-exercise lookup (by exerciseName, matching `ProgressionOutcomeSummary.exerciseName`)
 *  of the working-weight key and `failsBeforeDeload`, needed to turn the mutation's bare
 *  outcome (action + nextWeight) into a displayable before/after for `SummarySheet`. */
function buildProgressionMeta(bundle: ActiveWorkoutBundle): Record<string, { key: string; failsBeforeDeload: number }> {
  const day = bundle.program.days[bundle.cursor.dayIndex]
  const out: Record<string, { key: string; failsBeforeDeload: number }> = {}
  for (const ex of day?.exercises ?? []) {
    if (ex.scheme.type !== 'linear') continue
    out[ex.exerciseName] = { key: ex.tmKey ?? ex.exerciseName, failsBeforeDeload: ex.scheme.progression.failsBeforeDeload }
  }
  return out
}

/** Combines `useSaveWorkout`'s bare outcomes (exerciseName/action/nextWeight) with the
 *  pre-save working weight/fails the bundle already had, so `SummarySheet` can show a
 *  "100 → 105 (+5)" delta or a "2/3 fails" count without either side needing to persist
 *  the "before" values itself. */
function buildProgressionOutcomeDisplays(
  bundle: ActiveWorkoutBundle,
  outcomes: SaveWorkoutResult['progressionOutcomes'],
): ProgressionOutcomeDisplay[] {
  const meta = buildProgressionMeta(bundle)
  return outcomes.map((outcome) => {
    const m = meta[outcome.exerciseName]
    const prev = m ? bundle.workingWeights[m.key] : undefined
    return {
      exerciseName: outcome.exerciseName,
      action: outcome.action,
      previousWeight: prev?.weight ?? outcome.nextWeight,
      nextWeight: outcome.nextWeight,
      fails: outcome.action === 'hold' && prev ? prev.fails + 1 : undefined,
      failsBeforeDeload: m?.failsBeforeDeload,
    }
  })
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
  const addExercise = useSessionStore((s) => s.addExercise)
  const removeExercise = useSessionStore((s) => s.removeExercise)
  const replaceExercise = useSessionStore((s) => s.replaceExercise)
  const reorderExercises = useSessionStore((s) => s.reorderExercises)
  const startedAt = useSessionStore((s) => s.startedAt)
  const notes = useSessionStore((s) => s.notes)
  const bodyWeight = useSessionStore((s) => s.bodyWeight)
  const startRest = useRestTimer((s) => s.start)

  const [summary, setSummary] = useState<Summary | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [isResolving, setIsResolving] = useState(false)
  const [sheet, setSheet] = useState<{ mode: 'add' } | { mode: 'replace'; exIdx: number } | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  useEffect(() => () => useRestTimer.getState().skip(), []) // stop the rest timer on unmount

  const todayIdByName = bundle ? buildTodayExerciseIdMap(bundle) : {}

  if (status !== 'active') {
    return <Navigate to="/" replace />
  }

  function handleDragEnd(event: DragEndEvent) {
    const move = reorderFromDragEnd(exercises.map((e) => e.id), event.active.id, event.over?.id ?? null)
    if (move) reorderExercises(move.from, move.to)
  }

  async function handleFinish() {
    if (!bundle || !clientId || !user) {
      setErrorMsg('Still loading your program — please wait a moment and try again.')
      return
    }
    setErrorMsg(null)
    setIsResolving(true)
    try {
      const exerciseIdByName = buildExerciseIdMap(bundle)
      const adhocItems = exercises
        .filter((ex) => ex.adhoc)
        .map((ex) => ({ name: ex.exerciseName, kind: ex.kind }))
      const adhocIdByName = adhocItems.length > 0 ? await resolveExercisesByName(adhocItems, user.id) : {}

      const loggedSets: LoggedSet[] = []
      const sets: WorkoutSetInput[] = []
      const progressionSets: WorkoutSetInput[] = []
      let orderIndex = 0

      for (const exercise of exercises) {
        const resolvedId = exercise.adhoc
          ? (adhocIdByName[exercise.exerciseName] ?? null)
          : (exercise.exerciseId ?? exerciseIdByName[exercise.exerciseName] ?? null)
        // Spec safety net + Global Constraint "no null exercise_id saves": if an exercise
        // still can't be resolved (shouldn't happen post-resolution), skip all its sets
        // rather than writing rows with a null exercise_id.
        if (resolvedId == null) {
          // Unreachable in normal use (prescribed exercises are always in the program bundle;
          // adhoc exercises always resolve-or-mint). This guard only fires on out-of-band data
          // drift — surface it in dev so a silently-dropped set isn't invisible.
          if (import.meta.env.DEV) {
            console.warn(`[workout] dropping sets for unresolved exercise "${exercise.exerciseName}" (no exercise_id)`)
          }
          continue
        }
        exercise.sets.forEach((set, setIdx) => {
          if (set.reps == null) return
          const weight = exercise.kind === 'bodyweight' ? null : (set.weight ?? 0)
          const row: WorkoutSetInput = {
            exercise_id: resolvedId,
            set_number: setIdx + 1,
            weight,
            reps: set.reps,
            rpe: set.rpe ?? null,
            is_warmup: set.isWarmup ?? false,
            order_index: orderIndex++,
            prescription_index: set.prescriptionIndex ?? null,
          }
          sets.push(row)
          if (set.isWarmup) return // saved to p_sets, but excluded from tonnage/PR + progression
          loggedSets.push({ exerciseName: exercise.exerciseName, weight: weight ?? 0, reps: set.reps })
          if (!exercise.adhoc) progressionSets.push(row)
        })
      }

      const tonnage = sessionTonnage(loggedSets)
      const exerciseCount = new Set(loggedSets.map((s) => s.exerciseName)).size
      const prs = detectStrengthPRs(loggedSets, mapExistingPRs(bundle))

      const now = new Date()
      const timerFields = startedAt
        ? {
            duration_minutes: Math.round((now.getTime() - new Date(startedAt).getTime()) / 60000),
            start_time: startedAt,
            end_time: now.toISOString(),
          }
        : {}

      const session: WorkoutSessionInput = {
        discipline: 'strength',
        session_type: dayName ?? sessionType ?? undefined,
        date: localDateString(now),
        program_variant: bundle.program.name,
        program_week: bundle.cursor.week,
        status: 'completed',
        notes: notes.trim() || null,
        body_weight: bodyWeight,
        ...timerFields,
      }

      const programId = bundle.days[0]?.program_id
      const progressionExercises = buildProgressionExercises(bundle, exerciseIdByName)

      saveWorkout.mutate(
        {
          clientId,
          session,
          sets,
          progressionSets,
          program: bundle.program,
          cursor: bundle.cursor,
          programId,
          progressionExercises,
          workingWeights: bundle.workingWeights,
        },
        {
          onSuccess: (result) => {
            useRestTimer.getState().skip() // stop any running rest timer on finish
            const progressionOutcomes = buildProgressionOutcomeDisplays(bundle, result.progressionOutcomes)
            setSummary({ tonnage, setCount: loggedSets.length, exerciseCount, prs, progressionOutcomes })
          },
          onError: (err) => {
            setErrorMsg(err.message || 'Could not save your workout. Please try again.')
          },
        },
      )
    } catch (err) {
      setErrorMsg((err as Error).message || 'Could not save your workout. Please try again.')
    } finally {
      setIsResolving(false)
    }
  }

  function handleSummaryClose() {
    setSummary(null)
    reset()
    navigate('/')
  }

  return (
    <>
      <AppShell
        title={dayName ?? 'Workout'}
        right={
          <div className="flex items-center gap-2">
            {startedAt ? <SessionTimer startedAt={startedAt} /> : null}
            <button
              type="button"
              onClick={() => startRest()}
              aria-label="Start rest timer"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface text-text"
            >
              ⏱
            </button>
          </div>
        }
      >
        <div className="space-y-4 pb-24">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={exercises.map((e) => e.id)} strategy={verticalListSortingStrategy}>
              {exercises.map((exercise, exIdx) => (
                <ExerciseCard
                  key={exercise.id}
                  exIdx={exIdx}
                  exercise={exercise}
                  exerciseId={exercise.exerciseId ?? todayIdByName[exercise.exerciseName] ?? null}
                  onRemove={() => removeExercise(exIdx)}
                  onReplace={() => setSheet({ mode: 'replace', exIdx })}
                />
              ))}
            </SortableContext>
          </DndContext>
          <Button variant="secondary" fullWidth onClick={() => setSheet({ mode: 'add' })}>
            + Add exercise
          </Button>
          <SessionMetaCard />
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
          <Button fullWidth onClick={handleFinish} disabled={isResolving || saveWorkout.isPending}>
            {isResolving || saveWorkout.isPending ? 'Saving…' : 'Finish workout'}
          </Button>
        </div>
      </AppShell>

      {summary ? <SummarySheet {...summary} onClose={handleSummaryClose} /> : null}

      <RestTimerPill />

      {sheet ? (
        <ExercisePickerSheet
          onPick={(pick) => {
            if (sheet.mode === 'add') {
              addExercise(pick)
            } else {
              const exIdx = sheet.exIdx
              replaceExercise(exIdx, pick) // clears synchronously (Spec A); preserves the slot id
              if (pick.exerciseId && user) {
                const slotId = useSessionStore.getState().exercises[exIdx]?.id
                fetchLastSetsByExercise([pick.exerciseId], user.id)
                  .then((byId) => {
                    const lastSets = byId[pick.exerciseId!]
                    if (!lastSets) return
                    const ex = useSessionStore.getState().exercises[exIdx]
                    // Race guard: same slot AND every set still untouched (the shape replaceExercise left).
                    if (!ex || ex.id !== slotId) return
                    if (!ex.sets.every((s) => s.weight == null && s.reps == null && !s.done)) return
                    lastSets.forEach((ls, i) => {
                      if (i < ex.sets.length) useSessionStore.getState().updateSet(exIdx, i, { weight: ls.weight, reps: ls.reps })
                    })
                  })
                  .catch(() => {}) // no history / fetch error → leave blank
              }
            }
            setSheet(null)
          }}
          onClose={() => setSheet(null)}
        />
      ) : null}
    </>
  )
}
