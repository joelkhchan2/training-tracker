import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AppShell } from '../../components/ui/AppShell'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { NumberField } from '../../components/ui/NumberField'
import { Select } from '../../components/ui/Select'
import { TextField } from '../../components/ui/TextField'
import { Textarea } from '../../components/ui/Textarea'
import { WeightField } from '../../components/ui/WeightField'
import { useSaveProgram, useUpdateProgram } from '../../data/saveProgram'
import { getSupabase } from '../../data/supabase'
import type { ProgramDayRow, ProgramExerciseRow, ProgramRow } from '../../data/types'
import type { DayDiscipline } from '../../domain/types'
import type { DraftExerciseKind, DraftSet, ProgramDraft, ProgramRowsLike } from '../../domain/programDraft'
import { programRowsToDraft, validateDraft } from '../../domain/programDraft'
import { ExercisePicker } from './ExercisePicker'
import type { PickedExercise } from './ExercisePicker'

const DISCIPLINE_OPTIONS: { value: DayDiscipline; label: string }[] = [
  { value: 'strength', label: 'Strength' },
  { value: 'climbing', label: 'Climbing' },
  { value: 'cardio', label: 'Cardio' },
]

function emptyDraft(): ProgramDraft {
  return { name: '', description: '', isPublic: false, days: [] }
}

function newSetFor(kind: DraftExerciseKind): DraftSet {
  return kind === 'strength' ? { reps: 5, weight: 0 } : { reps: 5 }
}

/**
 * Fetches one program's raw day/exercise-row tree for edit-load. Mirrors
 * `programLibrary.ts`'s per-program batched reads, but scoped to a single
 * program id and left in the *raw* row shape `programRowsToDraft` needs —
 * specifically `exercise_type` — rather than the assembled domain `Program`,
 * which drops that field.
 */
async function fetchProgramRowsForEdit(programId: string): Promise<ProgramRowsLike> {
  const supabase = getSupabase()

  const { data: programData, error: programError } = await supabase
    .from('programs')
    .select('*')
    .eq('id', programId)
    .single()
  if (programError) throw programError
  const program = programData as ProgramRow

  const { data: daysData, error: daysError } = await supabase
    .from('program_days')
    .select('*')
    .eq('program_id', programId)
    .order('order_index')
  if (daysError) throw daysError
  const days = (daysData ?? []) as ProgramDayRow[]

  const dayIds = days.map(d => d.id)
  let exercises: ProgramExerciseRow[] = []
  if (dayIds.length > 0) {
    const { data: exData, error: exError } = await supabase
      .from('program_exercises')
      .select('*')
      .in('program_day_id', dayIds)
      .order('order_index')
    if (exError) throw exError
    exercises = (exData ?? []) as ProgramExerciseRow[]
  }

  return {
    name: program.name,
    description: program.description,
    is_public: program.is_public,
    days: days.map((day): ProgramRowsLike['days'][number] => ({
      name: day.name,
      discipline: day.discipline,
      target: day.target,
      order_index: day.order_index,
      exercises: exercises
        .filter(ex => ex.program_day_id === day.id)
        .map((ex): ProgramRowsLike['days'][number]['exercises'][number] => ({
          exercise_name: ex.exercise_name,
          exercise_type: ex.exercise_type,
          role_key: ex.role_key,
          order_index: ex.order_index,
          scheme: ex.scheme,
        })),
    })),
  }
}

/**
 * Authoring form for the Custom Program Builder: create (`/programs/new`) and
 * edit (`/programs/:id/edit`) share this one form. All state is local
 * (`useState<ProgramDraft>`) — nothing here needs a store since the draft
 * lives and dies with this page. Edit mode seeds the draft once, from the
 * program's raw rows via `programRowsToDraft`; after that the fetched tree is
 * never consulted again, so further edits are pure local state.
 *
 * Days carry a per-day discipline (strength/climbing/cardio) and can be
 * reordered with Move up/down; exercises and sets can only be added/removed,
 * not reordered.
 */
export function BuilderPage() {
  const { id: programId } = useParams<{ id: string }>()
  const isEdit = Boolean(programId)
  const navigate = useNavigate()

  const [draft, setDraft] = useState<ProgramDraft>(emptyDraft)
  const [ready, setReady] = useState(!isEdit)
  const [validationErrors, setValidationErrors] = useState<string[]>([])
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [pickingForDay, setPickingForDay] = useState<number | null>(null)

  const saveProgram = useSaveProgram()
  const updateProgram = useUpdateProgram()
  const isPending = saveProgram.isPending || updateProgram.isPending

  useEffect(() => {
    if (!isEdit || !programId) return
    let active = true
    fetchProgramRowsForEdit(programId)
      .then((rows) => {
        if (!active) return
        setDraft(programRowsToDraft(rows))
        setReady(true)
      })
      .catch((err: unknown) => {
        if (!active) return
        setErrorMsg(err instanceof Error ? err.message : 'Could not load this program.')
        setReady(true)
      })
    return () => {
      active = false
    }
  }, [isEdit, programId])

  function addDay() {
    setDraft(prev => ({ ...prev, days: [...prev.days, { name: `Day ${prev.days.length + 1}`, discipline: 'strength', exercises: [] }] }))
  }

  function updateDayDiscipline(dayIdx: number, discipline: DayDiscipline) {
    setDraft(prev => ({ ...prev, days: prev.days.map((day, i) => (i === dayIdx ? { ...day, discipline } : day)) }))
  }

  function updateDayTarget(dayIdx: number, target: string) {
    setDraft(prev => ({ ...prev, days: prev.days.map((day, i) => (i === dayIdx ? { ...day, target } : day)) }))
  }

  function moveDay(dayIdx: number, dir: -1 | 1) {
    setDraft(prev => {
      const j = dayIdx + dir
      if (j < 0 || j >= prev.days.length) return prev
      const days = [...prev.days]
      ;[days[dayIdx], days[j]] = [days[j], days[dayIdx]]
      return { ...prev, days }
    })
  }

  function removeDay(dayIdx: number) {
    setDraft(prev => ({ ...prev, days: prev.days.filter((_, i) => i !== dayIdx) }))
  }

  function updateDayName(dayIdx: number, name: string) {
    setDraft(prev => ({ ...prev, days: prev.days.map((day, i) => (i === dayIdx ? { ...day, name } : day)) }))
  }

  function addExercise(dayIdx: number, picked: PickedExercise) {
    setDraft(prev => ({
      ...prev,
      days: prev.days.map((day, i) =>
        i === dayIdx
          ? { ...day, exercises: [...day.exercises, { exerciseName: picked.exerciseName, kind: picked.kind, sets: [newSetFor(picked.kind)] }] }
          : day,
      ),
    }))
    setPickingForDay(null)
  }

  function removeExercise(dayIdx: number, exIdx: number) {
    setDraft(prev => ({
      ...prev,
      days: prev.days.map((day, i) =>
        i === dayIdx ? { ...day, exercises: day.exercises.filter((_, j) => j !== exIdx) } : day,
      ),
    }))
  }

  function addSet(dayIdx: number, exIdx: number) {
    setDraft(prev => ({
      ...prev,
      days: prev.days.map((day, i) =>
        i === dayIdx
          ? {
              ...day,
              exercises: day.exercises.map((ex, j) => (j === exIdx ? { ...ex, sets: [...ex.sets, newSetFor(ex.kind)] } : ex)),
            }
          : day,
      ),
    }))
  }

  function removeSet(dayIdx: number, exIdx: number, setIdx: number) {
    setDraft(prev => ({
      ...prev,
      days: prev.days.map((day, i) =>
        i === dayIdx
          ? {
              ...day,
              exercises: day.exercises.map((ex, j) => (j === exIdx ? { ...ex, sets: ex.sets.filter((_, k) => k !== setIdx) } : ex)),
            }
          : day,
      ),
    }))
  }

  function updateSetReps(dayIdx: number, exIdx: number, setIdx: number, reps: number) {
    setDraft(prev => ({
      ...prev,
      days: prev.days.map((day, i) =>
        i === dayIdx
          ? {
              ...day,
              exercises: day.exercises.map((ex, j) =>
                j === exIdx ? { ...ex, sets: ex.sets.map((s, k) => (k === setIdx ? { ...s, reps } : s)) } : ex,
              ),
            }
          : day,
      ),
    }))
  }

  function updateSetWeight(dayIdx: number, exIdx: number, setIdx: number, weight: number) {
    setDraft(prev => ({
      ...prev,
      days: prev.days.map((day, i) =>
        i === dayIdx
          ? {
              ...day,
              exercises: day.exercises.map((ex, j) =>
                j === exIdx ? { ...ex, sets: ex.sets.map((s, k) => (k === setIdx ? { ...s, weight } : s)) } : ex,
              ),
            }
          : day,
      ),
    }))
  }

  function handleSave() {
    const messages = validateDraft(draft)
    setValidationErrors(messages)
    if (messages.length > 0) return

    setErrorMsg(null)
    const onError = (err: Error) => setErrorMsg(err.message || 'Could not save this program. Please try again.')

    if (isEdit && programId) {
      updateProgram.mutate({ programId, draft }, { onSuccess: () => navigate('/programs'), onError })
    } else {
      saveProgram.mutate({ draft }, { onSuccess: () => navigate('/programs'), onError })
    }
  }

  if (!ready) {
    return (
      <AppShell title="Edit Program">
        <p className="text-muted">Loading…</p>
      </AppShell>
    )
  }

  return (
    <AppShell
      title={isEdit ? 'Edit Program' : 'New Program'}
      right={
        <Button variant="ghost" size="sm" onClick={() => navigate('/programs')} disabled={isPending}>
          Cancel
        </Button>
      }
    >
      <div className="space-y-6">
        <div className="space-y-4">
          <TextField label="Program name" value={draft.name} onChange={(name) => setDraft(prev => ({ ...prev, name }))} />
          <Textarea
            label="Description"
            value={draft.description}
            onChange={(description) => setDraft(prev => ({ ...prev, description }))}
          />
          <label className="flex items-center gap-3 text-sm font-medium text-muted">
            <input
              type="checkbox"
              checked={draft.isPublic}
              onChange={(event) => setDraft(prev => ({ ...prev, isPublic: event.target.checked }))}
              className="h-5 w-5 rounded border border-border"
            />
            Public program
          </label>
        </div>

        <div className="space-y-4">
          {draft.days.map((day, dayIdx) => (
            <Card key={dayIdx} data-testid={`day-${dayIdx}`} className="space-y-4">
              <div className="flex items-end gap-3">
                <TextField
                  label="Day name"
                  value={day.name}
                  onChange={(name) => updateDayName(dayIdx, name)}
                  className="flex-1"
                />
                <Button variant="secondary" size="sm" aria-label={`Move day ${dayIdx + 1} up`} onClick={() => moveDay(dayIdx, -1)} disabled={dayIdx === 0}>
                  Up
                </Button>
                <Button variant="secondary" size="sm" aria-label={`Move day ${dayIdx + 1} down`} onClick={() => moveDay(dayIdx, 1)} disabled={dayIdx === draft.days.length - 1}>
                  Down
                </Button>
                <Button variant="secondary" size="sm" aria-label={`Remove day ${dayIdx + 1}`} onClick={() => removeDay(dayIdx)}>
                  Remove day
                </Button>
              </div>

              <Select
                label={`Day ${dayIdx + 1} discipline`}
                value={day.discipline ?? 'strength'}
                onChange={(value) => updateDayDiscipline(dayIdx, value as DayDiscipline)}
                options={DISCIPLINE_OPTIONS}
              />

              {(day.discipline ?? 'strength') === 'strength' ? (
                <>
                  <div className="space-y-3">
                    {day.exercises.map((ex, exIdx) => (
                      <Card key={exIdx} data-testid={`exercise-${dayIdx}-${exIdx}`} className="space-y-3 border-border/60">
                        <div className="flex items-baseline justify-between gap-3">
                          <h3 className="text-base font-semibold text-text">{ex.exerciseName}</h3>
                          <Button variant="ghost" size="sm" onClick={() => removeExercise(dayIdx, exIdx)}>
                            Remove exercise
                          </Button>
                        </div>

                        <div className="space-y-3">
                          {ex.sets.map((set, setIdx) => (
                            <div key={setIdx} data-testid={`set-${dayIdx}-${exIdx}-${setIdx}`} className="flex items-end gap-2">
                              <NumberField
                                label="Reps"
                                value={set.reps}
                                onChange={(reps) => updateSetReps(dayIdx, exIdx, setIdx, reps)}
                                className="flex-1"
                              />
                              {ex.kind === 'strength' ? (
                                <WeightField
                                  label="Weight"
                                  valueLb={set.weight ?? 0}
                                  onChangeLb={(weight) => updateSetWeight(dayIdx, exIdx, setIdx, weight)}
                                  stepLb={5}
                                  className="flex-1"
                                />
                              ) : null}
                              <Button
                                variant="secondary"
                                size="sm"
                                aria-label={`Remove set ${setIdx + 1}`}
                                onClick={() => removeSet(dayIdx, exIdx, setIdx)}
                              >
                                Remove set
                              </Button>
                            </div>
                          ))}
                        </div>

                        <Button variant="secondary" size="sm" fullWidth onClick={() => addSet(dayIdx, exIdx)}>
                          Add set
                        </Button>
                      </Card>
                    ))}
                  </div>

                  {pickingForDay === dayIdx ? (
                    <div className="space-y-3 border-t border-border pt-4">
                      <ExercisePicker onPick={(picked) => addExercise(dayIdx, picked)} />
                      <Button variant="ghost" size="sm" fullWidth onClick={() => setPickingForDay(null)}>
                        Close
                      </Button>
                    </div>
                  ) : (
                    <Button variant="secondary" fullWidth onClick={() => setPickingForDay(dayIdx)}>
                      Add exercise
                    </Button>
                  )}
                </>
              ) : (
                <TextField
                  label="Target / note (optional)"
                  value={day.target ?? ''}
                  onChange={(target) => updateDayTarget(dayIdx, target)}
                  placeholder="e.g. project V5, 5k easy"
                />
              )}
            </Card>
          ))}
        </div>

        <Button variant="secondary" fullWidth onClick={addDay}>
          Add day
        </Button>

        {validationErrors.length > 0 ? (
          <div role="alert" className="space-y-1 rounded-xl border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
            {validationErrors.map((message, i) => (
              <p key={i}>{message}</p>
            ))}
          </div>
        ) : null}

        {errorMsg ? (
          <p role="alert" className="text-sm text-danger">
            {errorMsg}
          </p>
        ) : null}

        <Button fullWidth onClick={handleSave} disabled={isPending}>
          {isPending ? 'Saving…' : 'Save program'}
        </Button>
      </div>
    </AppShell>
  )
}
