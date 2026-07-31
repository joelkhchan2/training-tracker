export type Units = 'lbs' | 'kg'
export type Discipline = 'strength' | 'climbing' | 'cardio' | 'calisthenics'
/** The disciplines a single program day can be (no 'calisthenics' — see design D4). */
export type DayDiscipline = 'strength' | 'climbing' | 'cardio'
/** A program's overall discipline: the single shared day discipline, or 'mixed' when days differ.
 *  Display metadata only — never drives logging or the engine. */
export type ProgramDiscipline = DayDiscipline | 'mixed'

/** Training maxes keyed by lift key, e.g. { squat: 270, benchPress: 150 } */
export type TrainingMaxes = Record<string, number>

// ----- Program model (data-driven; the generic engine interprets this) -----
export interface PercentageSet { pct: number; reps: number; fsl?: boolean }
export interface FixedSet { reps: number; rpe?: number; weight?: number }

export interface LinearSet { reps: number; amrap?: boolean; targetReps?: number }

/** Per-exercise params for AMRAP-driven linear progression (used with ProgressionRule.amrap_linear).
 *  Lives on the `linear` Scheme variant (not on ProgramExercise) so it rides along with `scheme`
 *  through the jsonb column with no separate persistence path — see `buildActivationRows` /
 *  `buildDomainProgram` in `src/data`. */
export interface LinearProgressionConfig {
  increment: number
  deloadPercent: number
  failsBeforeDeload: number
  doubleThreshold?: number
  doubleIncrement?: number
}

export interface TimedSet { seconds: number }

export type Scheme =
  | { type: 'percentage'; tmKey: string; weeks: { sets: PercentageSet[] }[] }
  | { type: 'fixed'; sets: FixedSet[] }
  | { type: 'linear'; sets: LinearSet[]; progression: LinearProgressionConfig }
  | { type: 'timed'; sets: TimedSet[] }

export type ProgressionRule =
  | { type: 'cycle_tm_bump'; bumps: Record<string, number> }
  | { type: 'linear'; add: number; unit: Units; on: 'session' | 'week' }
  | { type: 'amrap_linear' }

export interface ProgramExercise {
  exerciseName: string
  tmKey?: string
  scheme: Scheme
  order: number
}
export interface ProgramDay {
  name: string
  /** Absent = strength (legacy/preset in-code days). Persisted rows always carry a value
   *  (DB column default 'strength'). */
  discipline?: DayDiscipline
  /** Free-text note for a non-strength day (e.g. "project V5"). No engine scheme. */
  target?: string
  exercises: ProgramExercise[]
}
export interface Program {
  name: string
  discipline: ProgramDiscipline
  days: ProgramDay[]
  progressionRule?: ProgressionRule
}

/** Where the user is in a program: 0-based day, 1-based week, 1-based cycle. */
export interface Cursor { dayIndex: number; week: number; cycle: number }

export interface PrescribedSet { weight?: number; reps?: number; durationSeconds?: number; isFsl?: boolean; isAmrap?: boolean; targetReps?: number }
export interface PrescribedExercise { exerciseName: string; tmKey?: string; sets: PrescribedSet[] }

// ----- Logging / analytics inputs -----
export interface LoggedSet { exerciseName: string; weight: number; reps: number }
/** One climbing row: grade (0-8) -> send count. */
export type ClimbingSends = Record<number, number>

export type PrType = 'e1rm' | 'volume' | 'max_v_grade'
export interface PersonalRecord { exerciseName: string; prType: PrType; value: number }
export interface DetectedPR {
  exerciseName: string; prType: PrType; oldValue: number | null; newValue: number
}
