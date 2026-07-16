import { describe, expect, it, vi } from 'vitest'
import { fetchActiveWorkout } from './queries'
import type {
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

    __setSupabase(makeSupabase({
      program_state: [programState],
      programs: [program],
      program_days: days,
      training_maxes: trainingMaxes,
      personal_records: [],
      program_exercises: programExercises,
      exercises,
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
  })
})
