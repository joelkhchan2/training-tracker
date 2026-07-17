export type Units = 'lbs' | 'kg'
export type Discipline = 'strength' | 'climbing' | 'cardio' | 'calisthenics'

/** Training maxes keyed by lift key, e.g. { squat: 270, benchPress: 150 } */
export type TrainingMaxes = Record<string, number>

// ----- Program model (data-driven; the generic engine interprets this) -----
export interface PercentageSet { pct: number; reps: number; fsl?: boolean }
export interface FixedSet { reps: number; rpe?: number; weight?: number }

export interface LinearSet { reps: number; amrap?: boolean; targetReps?: number }

export type Scheme =
  | { type: 'percentage'; tmKey: string; weeks: { sets: PercentageSet[] }[] }
  | { type: 'fixed'; sets: FixedSet[] }
  | { type: 'linear'; sets: LinearSet[] }

export type ProgressionRule =
  | { type: 'cycle_tm_bump'; bumps: Record<string, number> }
  | { type: 'linear'; add: number; unit: Units; on: 'session' | 'week' }
  | { type: 'amrap_linear' }

/** Per-exercise params for AMRAP-driven linear progression (used with ProgressionRule.amrap_linear). */
export interface LinearProgressionConfig {
  increment: number
  deloadPercent: number
  failsBeforeDeload: number
  doubleThreshold?: number
  doubleIncrement?: number
}

export interface ProgramExercise {
  exerciseName: string
  tmKey?: string
  scheme: Scheme
  order: number
  progression?: LinearProgressionConfig
}
export interface ProgramDay { name: string; exercises: ProgramExercise[] }
export interface Program {
  name: string
  discipline: Discipline
  days: ProgramDay[]
  progressionRule?: ProgressionRule
}

/** Where the user is in a program: 0-based day, 1-based week, 1-based cycle. */
export interface Cursor { dayIndex: number; week: number; cycle: number }

export interface PrescribedSet { weight?: number; reps: number; isFsl?: boolean; isAmrap?: boolean; targetReps?: number }
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
