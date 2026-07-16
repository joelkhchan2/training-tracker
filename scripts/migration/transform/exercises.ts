import type { RawExport, RawRow } from '../exportSchema.ts'

/**
 * Row shape mirrors the `exercises` table from
 * supabase/migrations/0002_reference_and_programs.sql. `user_id: null`
 * marks these as global-catalog rows (visible to every user), matching how
 * the source spreadsheet's Exercises_Master tab is a single shared list.
 */
export interface ExerciseRow {
  id: string
  user_id: null
  name: string
  primary_muscles: string | null
  equipment: string | null
  movement_pattern: string | null
  exercise_type: 'weighted' | 'bodyweight' | 'timed'
  popularity: number | null
  is_active: true
}

export interface NameToIdResult {
  /** normalized name -> exercise id, covering the catalog plus any names
   * discovered in the Training Log / Personal Bests / Templates tabs that
   * had no catalog match. */
  map: Map<string, string>
  /** Newly-minted global catalog rows for names not found in Exercises_Master. */
  extraRows: ExerciseRow[]
  /** Verbatim (non-normalized) names that triggered an extraRows entry, for
   * the reconciliation report. */
  createdFromLog: string[]
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

/** trim + collapse internal whitespace + lowercase, for use as a map key. */
function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase()
}

const STRENGTH_ENTRY_TYPES = new Set(['Strength', 'Calisthenics'])

/**
 * Converts the Exercises_Master tab into `exercises` seed rows.
 *
 * Only Active='Y' rows are imported (708 in the real export). The existing
 * `ID` column is reused verbatim as the row id — per the migration mapping
 * doc we do NOT generate new ids for exercises that already have one, so
 * any pre-existing references to that id elsewhere stay valid. A handful
 * of real rows (8 in the staged export) have a blank ID; those get a
 * freshly generated uuid since a null primary key isn't insertable.
 */
export function toExerciseCatalog(raw: RawExport): ExerciseRow[] {
  return raw.exercises
    .filter(row => row.Active === 'Y')
    .map(row => rowToExercise(row))
}

function rowToExercise(row: RawRow): ExerciseRow {
  const id = str(row.ID) ?? crypto.randomUUID()
  const primary = str(row.MusclesPrimary)
  const secondary = str(row.MusclesSecondary)
  const primaryMuscles = primary && secondary ? `${primary}, ${secondary}` : primary

  return {
    id,
    user_id: null,
    name: str(row.Name) ?? '',
    primary_muscles: primaryMuscles,
    equipment: str(row.Equipment),
    movement_pattern: str(row.PrimaryMovement),
    exercise_type: (str(row.ExerciseType) as ExerciseRow['exercise_type']) ?? 'weighted',
    popularity: num(row.PopularityScore),
    is_active: true,
  }
}

/** Distinct-name collection for a single Training Log matrix row, or null
 * if the row doesn't represent a strength-style set. */
function strengthNameFromLogRow(row: (string | number | null)[]): string | null {
  const entryType = row[2]
  if (typeof entryType !== 'string' || !STRENGTH_ENTRY_TYPES.has(entryType)) return null
  return str(row[3])
}

function namesFromTemplates(templates: RawRow[]): string[] {
  const names: string[] = []
  for (const template of templates) {
    const raw = template.Exercises
    if (typeof raw !== 'string' || raw.trim() === '') continue
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) continue
    for (const entry of parsed) {
      const name = str((entry as { name?: string | null }).name)
      if (name) names.push(name)
    }
  }
  return names
}

/**
 * Builds the name -> exercise_id map used to resolve FKs for strength_sets,
 * personal_records, and templates.
 *
 * Seeds from the (Active-only) catalog, then walks every distinct exercise
 * name referenced by the Training Log (Strength/Calisthenics rows),
 * Personal Bests, and Templates. Any name with no catalog match becomes a
 * brand-new global catalog row (per the mapping doc: "nothing is dropped") —
 * those are returned separately as `extraRows` so the loader can insert
 * them alongside the catalog, and their verbatim names are collected in
 * `createdFromLog` for the reconciliation report.
 */
export function buildNameToId(catalog: ExerciseRow[], raw: RawExport): NameToIdResult {
  const map = new Map<string, string>()
  for (const exercise of catalog) {
    map.set(normalizeName(exercise.name), exercise.id)
  }

  const extraRows: ExerciseRow[] = []
  const createdFromLog: string[] = []

  const candidateNames: string[] = []
  for (const row of raw.trainingLogMatrix) {
    const name = strengthNameFromLogRow(row)
    if (name) candidateNames.push(name)
  }
  for (const row of raw.personalBests) {
    const name = str(row.Exercise)
    if (name) candidateNames.push(name)
  }
  candidateNames.push(...namesFromTemplates(raw.templates))

  for (const name of candidateNames) {
    const key = normalizeName(name)
    if (map.has(key)) continue

    const newRow: ExerciseRow = {
      id: crypto.randomUUID(),
      user_id: null,
      name,
      primary_muscles: null,
      equipment: null,
      movement_pattern: null,
      exercise_type: 'weighted',
      popularity: null,
      is_active: true,
    }
    map.set(key, newRow.id)
    extraRows.push(newRow)
    createdFromLog.push(name)
  }

  return { map, extraRows, createdFromLog }
}
