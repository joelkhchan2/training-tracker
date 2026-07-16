import type { RawExport, RawRow } from '../exportSchema.ts'
import type { PrType } from '../../../src/domain/types'

/**
 * Row shape mirrors the `personal_records` table from
 * supabase/migrations/0002_reference_and_programs.sql. `user_id` and
 * `session_id` are deliberately absent — resolved by the load step, same
 * convention as log.ts's SessionRow etc.
 */
export interface PersonalRecordRow {
  exercise_id: string | null
  pr_type: PrType
  value: number
  reps: number | null
  weight: number | null
  date_achieved: string | null
  previous_value: number | null
}

/** One entry of a template's `exercises` jsonb array, e.g. {"name":"Bench Press","sets":4}. */
export interface TemplateExerciseEntry {
  name: string
  sets: number
}

/**
 * Row shape mirrors the `templates` table. `user_id: null` marks these as
 * presets (visible to every user via the "templates - read preset or own"
 * RLS policy), matching how every row in the source Templates tab has
 * IsPreset='TRUE'.
 */
export interface TemplateRow {
  user_id: null
  name: string
  exercises: TemplateExerciseEntry[]
  is_preset: boolean
}

function num(v: string | number | boolean | null | undefined): number | null {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isNaN(n) ? null : n
}

function str(v: string | number | boolean | null | undefined): string | null {
  if (v == null) return null
  const s = String(v).trim()
  return s === '' ? null : s
}

/** trim + collapse internal whitespace + lowercase, matching exercises.ts's
 * normalizeName so lookups against a nameToId map line up. */
function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase()
}

/** Parses either `YYYY-MM-DD` or `M/D/YY` into a canonical `YYYY-MM-DD`
 * string. Returns null for unparseable/blank input rather than throwing. */
function parseDate(v: string | number | boolean | null): string | null {
  if (v == null) return null
  const s = String(v).trim()
  if (s === '') return null

  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`

  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{2})$/.exec(s)
  if (us) {
    const [, m, d, yy] = us
    const year = 2000 + Number(yy)
    return `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }

  return null
}

const PR_TYPE_MAP: Record<string, PrType> = {
  'Estimated 1-Rep Max': 'e1rm',
  'Session Volume': 'volume',
  'Max V-Grade': 'max_v_grade',
}

/**
 * Converts the Personal Bests tab into `personal_records` rows.
 *
 * `exercise_id` is resolved via `nameToId` (built by
 * `buildNameToId(catalog, raw)` in exercises.ts, which already walks every
 * distinct Personal Bests `Exercise` name — so every row here is expected
 * to resolve). Rows whose `PR Type` doesn't match a known enum value are
 * dropped (none exist in the real export, but this keeps the transform
 * total either way).
 */
export function toPersonalRecords(raw: RawExport, nameToId: Map<string, string>): PersonalRecordRow[] {
  const rows: PersonalRecordRow[] = []

  for (const row of raw.personalBests) {
    const prType = PR_TYPE_MAP[str(row['PR Type']) ?? '']
    if (!prType) continue

    const value = num(row.Value)
    if (value == null) continue

    const exerciseName = str(row.Exercise)
    const exerciseId = exerciseName ? nameToId.get(normalizeName(exerciseName)) ?? null : null

    rows.push({
      exercise_id: exerciseId,
      pr_type: prType,
      value,
      reps: num(row.Reps),
      weight: num(row['Weight (lb)']),
      date_achieved: parseDate(row['Date Achieved']),
      previous_value: num(row['Previous Value']),
    })
  }

  return rows
}

function parseTemplateExercises(raw: string | number | boolean | null): TemplateExerciseEntry[] {
  const s = str(raw)
  if (!s) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(s)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []

  const entries: TemplateExerciseEntry[] = []
  for (const entry of parsed as unknown[]) {
    const name = str((entry as { name?: string | number | boolean | null }).name)
    const sets = num((entry as { sets?: string | number | boolean | null }).sets)
    if (name) entries.push({ name, sets: sets ?? 0 })
  }
  return entries
}

/**
 * Converts the Templates tab into `templates` rows. Every row in the real
 * export has `IsPreset='TRUE'`, but the `IsPreset==='TRUE'` check is kept
 * explicit rather than assumed, per the mapping doc.
 */
export function toTemplates(raw: RawExport): TemplateRow[] {
  return raw.templates.map((row: RawRow) => ({
    user_id: null,
    name: str(row.Name) ?? '',
    exercises: parseTemplateExercises(row.Exercises),
    is_preset: str(row.IsPreset)?.toUpperCase() === 'TRUE',
  }))
}
