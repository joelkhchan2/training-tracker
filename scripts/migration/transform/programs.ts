import { fiveThreeOne } from '../../../src/domain/presets/fiveThreeOne'
import type { ProgressionRule, Scheme } from '../../../src/domain/types'

/**
 * Row shapes mirror the `programs` / `program_days` / `program_exercises`
 * tables from supabase/migrations/0002_reference_and_programs.sql.
 *
 * These are pure DB-seed rows, not real inserts: `exercise_id` is left
 * null (resolved by `exerciseName` at load time, once the loader can look
 * up the global exercise catalog), and there are no program/day ids yet
 * (assigned by Postgres on insert). Parent linkage for the load step is
 * carried structurally instead of via FK values:
 *   - each day row's position in `days` IS its `order_index`.
 *   - each exercise row carries `dayIndex` (which day it belongs to) and
 *     `order_index` (its position within that day).
 * The loader is expected to insert the program, then insert days in
 * `order_index` order capturing the returned ids, then insert exercises
 * by mapping `dayIndex` -> that day's real program_day_id.
 *
 * `program.user_id: null` / `is_public: true` below are ownerless-library-
 * preset defaults (this transform has no user in scope). This migration is
 * NOT seeding a shared library preset, though: it's importing one specific
 * person's own historical program, so `load.ts`'s `assemble()` overrides
 * both to the resolved seed user's id / `false` before insert — this row
 * must always end up personally owned and private, never public.
 */

export interface ProgramRow {
  name: string
  description: string | null
  discipline: string
  progression_rule: ProgressionRule | null
  is_public: boolean
  user_id: string | null
}

export interface ProgramDayRow {
  name: string
  order_index: number
}

export interface ProgramExerciseRow {
  exerciseName: string
  exercise_id: null
  role_key: string | null
  order_index: number
  scheme: Scheme
  dayIndex: number
}

export function toProgramSeed(): {
  program: ProgramRow
  days: ProgramDayRow[]
  exercises: ProgramExerciseRow[]
} {
  const program: ProgramRow = {
    name: fiveThreeOne.name,
    description: null,
    discipline: fiveThreeOne.discipline,
    progression_rule: fiveThreeOne.progressionRule ?? null,
    is_public: true,
    user_id: null,
  }

  const days: ProgramDayRow[] = fiveThreeOne.days.map((day, dayIndex) => ({
    name: day.name,
    order_index: dayIndex,
  }))

  const exercises: ProgramExerciseRow[] = fiveThreeOne.days.flatMap((day, dayIndex) =>
    day.exercises.map(exercise => ({
      exerciseName: exercise.exerciseName,
      exercise_id: null,
      role_key: exercise.tmKey ?? null,
      order_index: exercise.order,
      scheme: exercise.scheme,
      dayIndex,
    })),
  )

  return { program, days, exercises }
}
