// DB row types mirroring the Supabase schema (supabase/migrations/0001, 0002, 0004).
// jsonb columns are typed against the domain shapes they actually store.
import type { Cursor, Discipline, ProgressionRule, Scheme, Units } from '../domain'

export interface ProfileRow {
  id: string
  display_name: string | null
  timezone: string
  units: Units
  enabled_disciplines: Discipline[]
  experience_level: 'beginner' | 'intermediate' | 'advanced' | null
  onboarding_complete: boolean
  created_at: string
  updated_at: string
}

export interface ProgramRow {
  id: string
  user_id: string | null
  name: string
  description: string | null
  discipline: Discipline
  progression_rule: ProgressionRule | null
  is_public: boolean
  created_at: string
}

export interface ProgramDayRow {
  id: string
  program_id: string
  name: string
  order_index: number
}

export interface ProgramExerciseRow {
  id: string
  program_day_id: string
  exercise_id: string | null
  role_key: string | null
  order_index: number
  scheme: Scheme
}

export interface ExerciseRow {
  id: string
  user_id: string | null
  name: string
  primary_muscles: string | null
  equipment: string | null
  movement_pattern: string | null
  exercise_type: 'weighted' | 'bodyweight' | 'timed' | null
  popularity: number | null
  is_active: boolean
  created_at: string
}

export interface TrainingMaxRow {
  id: string
  user_id: string
  key: string
  value: number
  prev_value: number | null
  updated_at: string
}

export interface ProgramStateRow {
  user_id: string
  active_program_id: string | null
  cursor: Cursor
  last_advance_key: string | null
  updated_at: string
}

export interface SessionRow {
  id: string
  user_id: string
  client_id: string
  discipline: Discipline
  session_type: string | null
  date: string
  start_time: string
  end_time: string | null
  duration_minutes: number | null
  body_weight: number | null
  program_variant: string | null
  program_week: number | null
  notes: string | null
  status: 'active' | 'completed'
  created_at: string
  updated_at: string
}

export interface StrengthSetRow {
  id: string
  user_id: string
  session_id: string
  exercise_id: string | null
  set_number: number
  weight: number | null
  reps: number | null
  rpe: number | null
  is_warmup: boolean
  order_index: number
  created_at: string
}

export interface PersonalRecordRow {
  id: string
  user_id: string
  exercise_id: string | null
  pr_type: string
  value: number
  reps: number | null
  weight: number | null
  date_achieved: string
  previous_value: number | null
  session_id: string | null
}
