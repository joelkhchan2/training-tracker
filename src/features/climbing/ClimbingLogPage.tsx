import { useEffect, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { DndContext, closestCenter, MouseSensor, TouchSensor, KeyboardSensor, useSensor, useSensors } from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { AppShell } from '../../components/ui/AppShell'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { NumberField } from '../../components/ui/NumberField'
import { Textarea } from '../../components/ui/Textarea'
import { cn } from '../../lib/cn'
import { formatVGrade, normalizeClimbingEntries, shapeSetForSave } from '../../domain'
import type { Cursor } from '../../domain'
import { useAuth } from '../../lib/useAuth'
import { useProfile } from '../../data/profile'
import { useActiveWorkout } from '../../data/queries'
import { buildSavePlan, useSaveWorkout } from '../../data/mutations'
import type { WorkoutSessionInput, WorkoutSetInput } from '../../data/mutations'
import { resolveExercisesByName } from '../../data/resolveDraftExercises'
import { useLogClimbing } from '../../data/logClimbing'
import { useClimbingDraft } from './climbingDraftStore'
import { LogMenuSheet } from '../shell/LogMenuSheet'
import { useSessionStore } from '../workout/sessionStore'
import { ExerciseCard } from '../workout/ExerciseCard'
import { ExercisePickerSheet } from '../workout/ExercisePickerSheet'
import { SessionMetaCard } from '../workout/SessionMetaCard'
import { reorderFromDragEnd } from '../workout/dragReorder'
import type { PickedExercise } from '../programs/ExercisePicker'

const GRADES = [0, 1, 2, 3, 4, 5, 6, 7, 8]

export function ClimbingLogPage() {
  const nav = useNavigate()
  const location = useLocation()
  const programLinked = Boolean((location.state as { programLinked?: boolean } | null)?.programLinked)
  const { user } = useAuth()
  const { data: profile, isLoading: profileLoading } = useProfile(user?.id)
  // Only program-linked mode consults the active bundle (for the guard + advance plan). Ad-hoc
  // never reads it. The query stays disabled until user.id is known.
  const { data: bundle } = useActiveWorkout(user?.id)
  const logClimbing = useLogClimbing()
  // The in-progress draft lives in a persisted store (tt-climbing-draft), so a half-entered
  // session survives exiting/backgrounding the app or a mid-entry reload — resuming where the
  // user left off, the same as the strength workout screen. Cleared on a successful save.
  const entries = useClimbingDraft((s) => s.entries)
  const notes = useClimbingDraft((s) => s.notes)
  const date = useClimbingDraft((s) => s.date)
  const patch = useClimbingDraft((s) => s.patch)
  const setNotes = useClimbingDraft((s) => s.setNotes)
  const setDate = useClimbingDraft((s) => s.setDate)
  const ensureStarted = useClimbingDraft((s) => s.ensureStarted)
  const resetDraft = useClimbingDraft((s) => s.reset)
  const [error, setError] = useState<string | null>(null)
  const [pr, setPr] = useState<{ newMax: number; prevMax: number | null } | null>(null)
  const [logMenuOpen, setLogMenuOpen] = useState(false)

  // A mixed day: exercises can be added right here as their own cards alongside the climbing
  // grades, backed by the SAME off-program session store the Workout screen uses (so "+ Log →
  // Strength workout" and this inline add-exercise affordance are always looking at one shared
  // draft, never two divergent ones). Only engaged while that store holds no OTHER (prescribed,
  // non-adhoc) session in progress — a real program workout is left alone; resume it on /workout
  // instead of trying to splice unrelated logic in here.
  const sessionStatus = useSessionStore((s) => s.status)
  const sessionAdhoc = useSessionStore((s) => s.adhoc)
  const sessionExercises = useSessionStore((s) => s.exercises)
  const sessionClientId = useSessionStore((s) => s.clientId)
  const sessionStartedAt = useSessionStore((s) => s.startedAt)
  const sessionNotes = useSessionStore((s) => s.notes)
  const sessionBodyWeight = useSessionStore((s) => s.bodyWeight)
  const startAdHocSession = useSessionStore((s) => s.startAdHoc)
  const addExercise = useSessionStore((s) => s.addExercise)
  const insertExerciseAt = useSessionStore((s) => s.insertExerciseAt)
  const removeExercise = useSessionStore((s) => s.removeExercise)
  const replaceExercise = useSessionStore((s) => s.replaceExercise)
  const reorderExercises = useSessionStore((s) => s.reorderExercises)
  const resetSession = useSessionStore((s) => s.reset)
  const saveWorkout = useSaveWorkout()
  const [exSheet, setExSheet] = useState<{ mode: 'add'; index?: number } | { mode: 'replace'; exIdx: number } | null>(null)

  const otherSessionInProgress = sessionStatus === 'active' && !sessionAdhoc
  const hasExercises = sessionStatus === 'active' && sessionAdhoc && sessionExercises.length > 0

  const exerciseSensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  // Mint the idempotency key on mount (idempotent — keeps an existing draft's key).
  useEffect(() => { ensureStarted() }, [ensureStarted])

  function handleExerciseDragEnd(event: DragEndEvent) {
    const move = reorderFromDragEnd(sessionExercises.map((e) => e.id), event.active.id, event.over?.id ?? null)
    if (move) reorderExercises(move.from, move.to)
  }

  function openAddExercise() {
    if (sessionStatus !== 'active') {
      startAdHocSession({ clientId: crypto.randomUUID(), startedAt: new Date().toISOString() })
    }
    setExSheet({ mode: 'add' })
  }

  function handleExercisePick(pick: PickedExercise) {
    if (!exSheet) return
    if (exSheet.mode === 'add') {
      if (exSheet.index !== undefined) insertExerciseAt(exSheet.index, pick)
      else addExercise(pick)
    } else {
      replaceExercise(exSheet.exIdx, pick)
    }
    setExSheet(null)
  }

  /** Resolves/mints exercise ids and saves the inline exercise cards as their own ad-hoc
   *  strength session (same day/date as the climbing log), then clears that session's draft.
   *  Mirrors the ad-hoc branch of WorkoutPage's save flow — no program/cursor/progression,
   *  since exercises added here are never tied to a prescribed program day. */
  async function saveInlineExercises(): Promise<void> {
    if (!user || !sessionClientId) return
    const needsResolve = sessionExercises
      .filter((ex) => ex.adhoc || !ex.exerciseId)
      .map((ex) => ({ name: ex.exerciseName, kind: ex.kind }))
    const resolvedByName = needsResolve.length > 0 ? await resolveExercisesByName(needsResolve, user.id) : {}

    const sets: WorkoutSetInput[] = []
    let orderIndex = 0
    for (const exercise of sessionExercises) {
      const resolvedId = exercise.exerciseId ?? resolvedByName[exercise.exerciseName] ?? null
      if (resolvedId == null) continue // unreachable in normal use — resolveExercisesByName mints-or-throws
      exercise.sets.forEach((set, setIdx) => {
        const shaped = shapeSetForSave(exercise.inputType, set)
        if (shaped == null) return // nothing typed for this set — nothing to save
        sets.push({
          exercise_id: resolvedId,
          set_number: setIdx + 1,
          weight: shaped.weight,
          reps: shaped.reps,
          duration_seconds: shaped.durationSeconds,
          rpe: set.rpe ?? null,
          is_warmup: set.isWarmup ?? false,
          order_index: orderIndex++,
          prescription_index: set.prescriptionIndex ?? null,
        })
      })
    }
    if (sets.length === 0) {
      resetSession() // added card(s) but nothing was typed in — nothing to save, clear the empty draft
      return
    }

    const now = new Date()
    const session: WorkoutSessionInput = {
      discipline: 'strength',
      session_type: 'Ad-hoc workout',
      date,
      program_variant: null,
      program_week: null,
      status: 'completed',
      notes: sessionNotes.trim() || null,
      body_weight: sessionBodyWeight,
      ...(sessionStartedAt
        ? {
            duration_minutes: Math.round((now.getTime() - new Date(sessionStartedAt).getTime()) / 60000),
            start_time: sessionStartedAt,
            end_time: now.toISOString(),
          }
        : {}),
    }

    await saveWorkout.mutateAsync({ clientId: sessionClientId, session, sets, adhoc: true })
    resetSession()
  }

  const climbingEnabled = (profile?.enabled_disciplines ?? []).includes('climbing')
  // A program-linked launch is authorized by the program itself, so skip the enabled-disciplines redirect.
  if (!programLinked && !profileLoading && profile && !climbingEnabled) return <Navigate to="/" replace />

  // In program-linked mode Save waits for the bundle to resolve (there must be a cursor to snapshot).
  const bundleResolving = programLinked && !bundle

  const payload = normalizeClimbingEntries(
    GRADES.map((g) => ({
      grade: formatVGrade(g),
      attempts: entries[g]?.attempts ?? 0,
      sends: entries[g]?.sends ?? 0,
    })),
  )
  const valid = payload.length > 0

  // Where a successful save lands: Home in program-linked mode (so the advanced cursor shows), History otherwise.
  const successDest = programLinked ? '/' : '/history'

  async function handleSave() {
    if (!valid && !hasExercises) {
      setError('Log at least one attempt or send, or add an exercise, before saving.')
      return
    }
    setError(null)

    if (hasExercises) {
      try {
        await saveInlineExercises()
      } catch (err) {
        setError((err as Error).message || 'Could not save your exercises. Please try again.')
        return
      }
    }

    if (!valid) {
      nav(successDest)
      return
    }

    // ONE snapshot at Save-press drives both the guard and the plan (they can never disagree).
    let advance: { nextCursor: Cursor; lastAdvanceKey: string } | undefined
    if (programLinked && bundle) {
      const { program, cursor } = bundle
      const dayDiscipline = program.days[cursor.dayIndex]?.discipline ?? 'strength'
      if (dayDiscipline === 'climbing') {
        const plan = buildSavePlan(program, cursor)
        advance = { nextCursor: plan.nextCursor, lastAdvanceKey: plan.lastAdvanceKey }
      }
      // else: cursor drifted onto a non-climbing day -> fall back to ad-hoc (log, no advance).
    }

    const clientId = ensureStarted()
    logClimbing.mutate(
      { clientId, date, notes: notes.trim() || null, sends: payload, nextCursor: advance?.nextCursor, lastAdvanceKey: advance?.lastAdvanceKey },
      {
        onSuccess: (res) => {
          // Clear the persisted draft first so the next log starts blank and a killed-app-then-
          // reopen can't resurrect an already-saved session. The PR screen reads its own local
          // state, so clearing the draft here doesn't affect it.
          resetDraft()
          if (res.newMaxGrade != null) setPr({ newMax: res.newMaxGrade, prevMax: res.previousMaxGrade })
          else nav(successDest)
        },
        onError: () => setError('Could not save. Please try again.'),
      },
    )
  }

  if (pr) {
    return (
      <AppShell title="New personal record">
        <Card className="space-y-3 text-center">
          <p className="text-4xl">🎉</p>
          <p className="text-lg font-semibold text-text">New max grade — V{pr.newMax}!</p>
          {pr.prevMax != null ? <p className="text-sm text-muted">Up from V{pr.prevMax}.</p> : null}
        </Card>
        <Button fullWidth onClick={() => nav(successDest)}>Continue</Button>
      </AppShell>
    )
  }

  return (
    <AppShell
      title="Log climbing"
      right={
        <button
          type="button"
          aria-label="Log another session"
          onClick={() => setLogMenuOpen(true)}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface text-xl font-semibold text-text"
        >
          +
        </button>
      }
    >
      <div className="space-y-4">
        <Card className="space-y-3">
          <p className="text-sm text-muted">Attempts &amp; sends per grade</p>
          <div className="grid grid-cols-2 gap-3">
            {GRADES.map((g) => {
              const attempts = entries[g]?.attempts ?? 0
              const sends = entries[g]?.sends ?? 0
              const active = attempts > 0 || sends > 0
              return (
                <div
                  key={g}
                  className={cn(
                    'space-y-3 rounded-2xl border p-3',
                    active ? 'border-accent bg-accent/10' : 'border-border bg-bg',
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xl font-extrabold text-text">{formatVGrade(g)}</span>
                    {active ? <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-accent" /> : null}
                  </div>
                  <div className="space-y-2">
                    <div>
                      <span className="block text-[10px] font-medium uppercase tracking-wide text-muted">Attempts</span>
                      <NumberField
                        label={`${formatVGrade(g)} attempts`}
                        labelClassName="sr-only"
                        value={attempts}
                        onChange={(v) => patch(g, 'attempts', v)}
                        min={0}
                        compact
                      />
                    </div>
                    <div>
                      <span className="block text-[10px] font-medium uppercase tracking-wide text-muted">Sends</span>
                      <NumberField
                        label={`${formatVGrade(g)} sends`}
                        labelClassName="sr-only"
                        value={sends}
                        onChange={(v) => patch(g, 'sends', v)}
                        min={0}
                        compact
                      />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </Card>

        <Card className="space-y-3">
          <p className="text-sm text-muted">Exercises</p>
          {otherSessionInProgress ? (
            <div className="space-y-2">
              <p className="text-sm text-muted">A workout is already in progress — resume it to add exercises there.</p>
              <Button variant="secondary" fullWidth onClick={() => nav('/workout')}>
                Resume workout
              </Button>
            </div>
          ) : (
            <>
              {sessionExercises.length > 0 ? (
                <DndContext sensors={exerciseSensors} collisionDetection={closestCenter} onDragEnd={handleExerciseDragEnd}>
                  <SortableContext items={sessionExercises.map((e) => e.id)} strategy={verticalListSortingStrategy}>
                    <div className="space-y-2">
                      {sessionExercises.map((exercise, exIdx) => (
                        <ExerciseCard
                          key={exercise.id}
                          exIdx={exIdx}
                          exercise={exercise}
                          exerciseId={exercise.exerciseId}
                          onRemove={() => removeExercise(exIdx)}
                          onReplace={() => setExSheet({ mode: 'replace', exIdx })}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              ) : null}
              <Button variant="secondary" fullWidth onClick={openAddExercise}>
                + Add exercise
              </Button>
              {hasExercises ? <SessionMetaCard /> : null}
            </>
          )}
        </Card>

        <Card className="space-y-4">
          <div className="flex flex-col gap-2">
            <label htmlFor="climb-date" className="text-sm font-medium text-muted">Date</label>
            <input
              id="climb-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="h-12 w-full rounded-xl border border-border bg-surface px-4 text-base text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            />
          </div>
          <Textarea label="Notes (optional)" value={notes} onChange={setNotes} rows={3} />
        </Card>
        {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
        <Button
          fullWidth
          onClick={handleSave}
          disabled={(!valid && !hasExercises) || logClimbing.isPending || saveWorkout.isPending || bundleResolving}
        >
          {logClimbing.isPending || saveWorkout.isPending ? 'Saving…' : 'Save'}
        </Button>
      </div>
      <LogMenuSheet open={logMenuOpen} onClose={() => setLogMenuOpen(false)} exclude={['climbing', 'strength']} />
      {exSheet ? <ExercisePickerSheet onPick={handleExercisePick} onClose={() => setExSheet(null)} /> : null}
    </AppShell>
  )
}
