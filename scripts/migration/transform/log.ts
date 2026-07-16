import type { RawExport } from '../exportSchema.ts'
import type { NameToIdResult } from './exercises.ts'

/**
 * Row shapes mirror the `sessions` / `strength_sets` / `climbing_sends` /
 * `cardio_activities` / `calisthenics_sets` / `daily_checkins` tables from
 * supabase/migrations/0001_core_schema.sql. `user_id` is deliberately absent
 * from every row here — these are pure transform output, resolved to the
 * seed user's real auth id by the (separate) load step, same as how
 * programs.ts leaves `exercise_id`/day linkage to be resolved at load time.
 *
 * `SessionRow.id` is a transform-local uuid, generated once per (date,
 * session name) group so every child row below can carry it as
 * `session_id` and the load step can swap it for the real inserted id.
 */
export interface SessionRow {
  id: string
  client_id: string
  date: string
  session_type: string | null
  discipline: 'strength' | 'climbing' | 'cardio' | 'calisthenics'
  body_weight: number | null
  status: 'completed'
}

export interface StrengthSetRow {
  session_id: string
  exercise_id: string | null
  set_number: number | null
  weight: number | null
  reps: number | null
  rpe: number | null
}

export interface ClimbingSendRow {
  session_id: string
  grade_system: 'v_scale'
  grade: string
  count: number
}

export interface CardioActivityRow {
  session_id: string
  activity: string | null
  duration_minutes: number | null
  distance_km: number | null
  notes: string | null
}

export interface CalisthenicsSetRow {
  client_id: string
  date: string
  exercise: string | null
  value: number | null
}

export interface DailyCheckinRow {
  date: string
  body_weight: number | null
  sleep_hours: number | null
  sleep_quality: number | null
  energy: number | null
  soreness: number | null
  steps: number | null
}

export interface ToSessionsResult {
  sessions: SessionRow[]
  strengthSets: StrengthSetRow[]
  climbingSends: ClimbingSendRow[]
  cardioActivities: CardioActivityRow[]
  calisthenicsSets: CalisthenicsSetRow[]
  dailyCheckins: DailyCheckinRow[]
  /** Verbatim exercise names from Strength/Calisthenics rows that had no
   * entry in `nameToId`. Expected to be empty when `nameToId` was built via
   * `buildNameToId(catalog, raw)`, since that walk already covers every
   * distinct Training Log strength-style name. */
  unmatched: string[]
}

type LogRow = (string | number | null)[]

const SESSION_ENTRY_TYPES = new Set(['Strength', 'Calisthenics', 'Climbing', 'Cardio'])
const STRENGTH_LIKE_ENTRY_TYPES = new Set(['Strength', 'Calisthenics'])
const V_GRADE_COLUMN_START = 9
const V_GRADE_COUNT = 9 // V0..V8

function num(v: string | number | null | undefined): number | null {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isNaN(n) ? null : n
}

function str(v: string | number | null | undefined): string | null {
  if (v == null) return null
  const s = String(v).trim()
  return s === '' ? null : s
}

/** trim + collapse internal whitespace + lowercase, matching exercises.ts's
 * normalizeName so lookups against `nameToId.map` line up. */
function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase()
}

/** Parses either `YYYY-MM-DD` or `M/D/YY` into a canonical `YYYY-MM-DD`
 * string. Returns null for unparseable/blank input rather than throwing,
 * since a handful of Training Log rows may have a blank Date cell. */
function parseDate(v: string | number | null): string | null {
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

function disciplineForEntryType(entryType: string): SessionRow['discipline'] {
  switch (entryType) {
    case 'Strength':
      return 'strength'
    case 'Calisthenics':
      return 'calisthenics'
    case 'Climbing':
      return 'climbing'
    case 'Cardio':
      return 'cardio'
    default:
      return 'strength'
  }
}

/**
 * Converts the Training Log matrix (positional rows, per the migration
 * mapping doc's column index table) into typed rows for every downstream
 * table it feeds.
 *
 * Strength/Calisthenics/Climbing/Cardio rows are grouped into `sessions` by
 * (date, session name) — one session per group, with a transform-local uuid
 * so child rows (`strengthSets`/`climbingSends`/`cardioActivities`) can
 * carry it as their `session_id` FK. GTG and Daily Check-in rows are
 * date-based, not session-based, and go straight to `calisthenicsSets` /
 * `dailyCheckins`. Skipped/Recovery/anything else is dropped.
 */
export function toSessions(raw: RawExport, nameToId: NameToIdResult): ToSessionsResult {
  const sessions: SessionRow[] = []
  const strengthSets: StrengthSetRow[] = []
  const climbingSends: ClimbingSendRow[] = []
  const cardioActivities: CardioActivityRow[] = []
  const calisthenicsSets: CalisthenicsSetRow[] = []
  const unmatched: string[] = []

  // Daily Check-in is unique per day per the target table's constraint, so
  // rows are collected in a map keyed by date and de-duped (last row wins)
  // rather than appended to an array.
  const dailyCheckinsByDate = new Map<string, DailyCheckinRow>()

  const sessionsByKey = new Map<string, SessionRow>()

  for (const row of raw.trainingLogMatrix as LogRow[]) {
    const entryType = str(row[2])
    if (!entryType) continue

    const dateKey = parseDate(row[0])
    if (!dateKey) continue

    if (SESSION_ENTRY_TYPES.has(entryType)) {
      const sessionName = str(row[1])
      const groupKey = `${dateKey}|${sessionName ?? ''}`

      let session = sessionsByKey.get(groupKey)
      if (!session) {
        session = {
          id: crypto.randomUUID(),
          client_id: `mig:${dateKey}|${sessionName ?? ''}`,
          date: dateKey,
          session_type: sessionName,
          discipline: disciplineForEntryType(entryType),
          body_weight: num(row[23]),
          status: 'completed',
        }
        sessionsByKey.set(groupKey, session)
        sessions.push(session)
      } else if (session.body_weight == null) {
        session.body_weight = num(row[23])
      }

      if (STRENGTH_LIKE_ENTRY_TYPES.has(entryType)) {
        const exerciseName = str(row[3])
        let exerciseId: string | null = null
        if (exerciseName) {
          const resolved = nameToId.map.get(normalizeName(exerciseName))
          if (resolved) {
            exerciseId = resolved
          } else {
            unmatched.push(exerciseName)
          }
        }

        strengthSets.push({
          session_id: session.id,
          exercise_id: exerciseId,
          set_number: num(row[4]),
          weight: num(row[5]),
          reps: num(row[6]),
          rpe: num(row[7]),
        })
      } else if (entryType === 'Climbing') {
        for (let g = 0; g < V_GRADE_COUNT; g++) {
          const count = num(row[V_GRADE_COLUMN_START + g])
          if (count != null && count > 0) {
            climbingSends.push({
              session_id: session.id,
              grade_system: 'v_scale',
              grade: `V${g}`,
              count,
            })
          }
        }
      } else if (entryType === 'Cardio') {
        cardioActivities.push({
          session_id: session.id,
          activity: str(row[3]),
          duration_minutes: num(row[30]),
          distance_km: num(row[32]),
          notes: str(row[31]),
        })
      }
    } else if (entryType === 'GTG') {
      const exercise = str(row[3])
      calisthenicsSets.push({
        client_id: `mig:gtg:${dateKey}|${exercise ?? ''}`,
        date: dateKey,
        exercise,
        value: num(row[6]),
      })
    } else if (entryType === 'Daily Check-in') {
      dailyCheckinsByDate.set(dateKey, {
        date: dateKey,
        body_weight: num(row[23]),
        sleep_hours: num(row[24]),
        sleep_quality: num(row[25]),
        energy: num(row[27]),
        soreness: num(row[28]),
        steps: num(row[26]),
      })
    }
    // Skipped / Recovery / anything else: no row emitted.
  }

  return {
    sessions,
    strengthSets,
    climbingSends,
    cardioActivities,
    calisthenicsSets,
    dailyCheckins: Array.from(dailyCheckinsByDate.values()),
    unmatched,
  }
}
