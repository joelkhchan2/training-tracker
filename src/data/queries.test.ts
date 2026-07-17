import { describe, expect, it, vi } from 'vitest'
import type { LinearProgressionConfig } from '../domain'
import { buildWorkingWeights, fetchActiveWorkout } from './queries'
import type {
  ExerciseProgressRow,
  ExerciseRow,
  ProgramDayRow,
  ProgramExerciseRow,
  ProgramRow,
  ProgramStateRow,
  TrainingMaxRow,
} from './types'

// A minimal chainable fake mirroring the subset of the supabase-js query builder
// this module touches (select/eq/in/order + the maybeSingle/single/thenable terminals).
function fakeTable(rows: unknown[]) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    in: () => builder,
    order: () => builder,
    maybeSingle: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
    single: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
    then: (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
      Promise.resolve({ data: rows, error: null }).then(resolve),
  }
  return builder
}

function makeSupabase(tables: Record<string, unknown[]>) {
  return { from: (table: string) => fakeTable(tables[table] ?? []) }
}

const { getSupabase, __setSupabase } = vi.hoisted(() => {
  let current: unknown
  return {
    getSupabase: () => current,
    __setSupabase: (client: unknown) => { current = client },
  }
})

vi.mock('./supabase', () => ({ getSupabase }))

describe('fetchActiveWorkout', () => {
  it('returns null when the user has no active program', async () => {
    __setSupabase(makeSupabase({
      program_state: [{ user_id: 'u1', active_program_id: null, cursor: { dayIndex: 0, week: 1, cycle: 1 } } satisfies Partial<ProgramStateRow>],
    }))

    expect(await fetchActiveWorkout('u1')).toBeNull()
  })

  it('assembles the domain Program and bundle from the joined DB rows', async () => {
    const programState: ProgramStateRow = {
      user_id: 'u1',
      active_program_id: 'prog-1',
      cursor: { dayIndex: 0, week: 1, cycle: 2 },
      last_advance_key: '1-1-0',
      updated_at: '2026-01-01T00:00:00Z',
    }
    const program: ProgramRow = {
      id: 'prog-1', user_id: 'u1', name: '5/3/1', description: null,
      discipline: 'strength', progression_rule: null, is_public: false, created_at: '2026-01-01T00:00:00Z',
    }
    const days: ProgramDayRow[] = [
      { id: 'day-b', program_id: 'prog-1', name: 'Gym B', order_index: 1 },
      { id: 'day-a', program_id: 'prog-1', name: 'Gym A', order_index: 0 },
    ]
    const programExercises: ProgramExerciseRow[] = [
      { id: 'pe-2', program_day_id: 'day-a', exercise_id: 'ex-bench', role_key: 'benchPress', order_index: 1,
        scheme: { type: 'fixed', sets: [{ reps: 5 }] } },
      { id: 'pe-1', program_day_id: 'day-a', exercise_id: 'ex-squat', role_key: 'squat', order_index: 0,
        scheme: { type: 'percentage', tmKey: 'squat', weeks: [{ sets: [{ pct: 0.7, reps: 5 }] }] } },
    ]
    const exercises: ExerciseRow[] = [
      { id: 'ex-squat', user_id: null, name: 'Squat', primary_muscles: null, equipment: null,
        movement_pattern: null, exercise_type: 'weighted', popularity: null, is_active: true, created_at: '2026-01-01T00:00:00Z' },
      { id: 'ex-bench', user_id: null, name: 'Bench Press', primary_muscles: null, equipment: null,
        movement_pattern: null, exercise_type: 'weighted', popularity: null, is_active: true, created_at: '2026-01-01T00:00:00Z' },
    ]
    const trainingMaxes: TrainingMaxRow[] = [
      { id: 'tm-1', user_id: 'u1', key: 'squat', value: 275, prev_value: 265, updated_at: '2026-01-01T00:00:00Z' },
    ]
    const exerciseProgress: ExerciseProgressRow[] = [
      { id: 'progress-1', user_id: 'u1', program_id: 'prog-1', exercise_id: 'ex-squat',
        current_weight: 225, consecutive_fails: 0, updated_at: '2026-01-01T00:00:00Z' },
      { id: 'progress-2', user_id: 'u1', program_id: 'prog-1', exercise_id: 'ex-bench',
        current_weight: 135, consecutive_fails: 1, updated_at: '2026-01-01T00:00:00Z' },
    ]

    __setSupabase(makeSupabase({
      program_state: [programState],
      programs: [program],
      program_days: days,
      training_maxes: trainingMaxes,
      personal_records: [],
      program_exercises: programExercises,
      exercises,
      exercise_progress: exerciseProgress,
    }))

    const bundle = await fetchActiveWorkout('u1')
    expect(bundle).not.toBeNull()
    expect(bundle!.cursor).toEqual({ dayIndex: 0, week: 1, cycle: 2 })
    expect(bundle!.trainingMaxes).toEqual({ squat: 275 })
    expect(bundle!.exercisesById['ex-squat'].name).toBe('Squat')

    // Days sorted by order_index; exercises within a day sorted by order_index,
    // with the DB exercise name resolved and role_key surfaced as tmKey.
    expect(bundle!.program.days.map(d => d.name)).toEqual(['Gym A', 'Gym B'])
    expect(bundle!.program.days[0].exercises).toEqual([
      { exerciseName: 'Squat', tmKey: 'squat', order: 0, scheme: programExercises[1].scheme },
      { exerciseName: 'Bench Press', tmKey: 'benchPress', order: 1, scheme: programExercises[0].scheme },
    ])
    expect(bundle!.program.days[1].exercises).toEqual([])

    // exercise_progress rows are mapped exercise_id -> (role_key ?? exercise name), the
    // same key getPrescription's linear branch looks up by (tmKey ?? exerciseName).
    expect(bundle!.workingWeights).toEqual({
      squat: { weight: 225, fails: 0 },
      benchPress: { weight: 135, fails: 1 },
    })
    expect(bundle!.workingWeightValues).toEqual({ squat: 225, benchPress: 135 })
  })
})

describe('buildWorkingWeights', () => {
  const LINEAR_CONFIG: LinearProgressionConfig = { increment: 5, deloadPercent: 0.1, failsBeforeDeload: 3 }
  const exercisesById: Record<string, ExerciseRow> = {
    'ex-squat': { id: 'ex-squat', user_id: null, name: 'Squat', primary_muscles: null, equipment: null,
      movement_pattern: null, exercise_type: 'weighted', popularity: null, is_active: true, created_at: '2026-01-01T00:00:00Z' },
  }
  const programExercises: ProgramExerciseRow[] = [
    { id: 'pe-1', program_day_id: 'day-a', exercise_id: 'ex-squat', role_key: 'squat', order_index: 0,
      scheme: { type: 'linear', sets: [{ reps: 5 }], progression: LINEAR_CONFIG } },
  ]

  it('keys by role_key (tmKey) when present', () => {
    const progressRows: ExerciseProgressRow[] = [
      { id: 'p1', user_id: 'u1', program_id: 'prog-1', exercise_id: 'ex-squat',
        current_weight: 100, consecutive_fails: 2, updated_at: '2026-01-01T00:00:00Z' },
    ]
    expect(buildWorkingWeights(programExercises, exercisesById, progressRows)).toEqual({
      squat: { weight: 100, fails: 2 },
    })
  })

  it('falls back to the resolved exercise name when there is no role_key', () => {
    const noRoleKeyExercises: ProgramExerciseRow[] = [
      { id: 'pe-1', program_day_id: 'day-a', exercise_id: 'ex-squat', role_key: null, order_index: 0,
        scheme: { type: 'linear', sets: [{ reps: 5 }], progression: LINEAR_CONFIG } },
    ]
    const progressRows: ExerciseProgressRow[] = [
      { id: 'p1', user_id: 'u1', program_id: 'prog-1', exercise_id: 'ex-squat',
        current_weight: 100, consecutive_fails: 0, updated_at: '2026-01-01T00:00:00Z' },
    ]
    expect(buildWorkingWeights(noRoleKeyExercises, exercisesById, progressRows)).toEqual({
      Squat: { weight: 100, fails: 0 },
    })
  })

  it('ignores a progress row whose exercise_id is not in the program', () => {
    const progressRows: ExerciseProgressRow[] = [
      { id: 'p1', user_id: 'u1', program_id: 'prog-1', exercise_id: 'ex-unrelated',
        current_weight: 999, consecutive_fails: 0, updated_at: '2026-01-01T00:00:00Z' },
    ]
    expect(buildWorkingWeights(programExercises, exercisesById, progressRows)).toEqual({})
  })
})
