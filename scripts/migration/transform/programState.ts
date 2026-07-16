import type { RawExport } from '../exportSchema.ts'
import type { Cursor } from '../../../src/domain/types'
import { fiveThreeOne } from '../../../src/domain/presets/fiveThreeOne'
import { programWeekCount } from '../../../src/domain/programEngine'

/**
 * Row shape mirrors the `training_maxes` table from
 * supabase/migrations/0002_reference_and_programs.sql. `user_id` is
 * deliberately absent — resolved by the load step to the seed user's real
 * auth id, same convention as log.ts's SessionRow etc.
 */
export interface TrainingMaxRow {
  key: 'squat' | 'benchPress' | 'barbellDeadlift' | 'overheadPress'
  value: number
  prev_value: number | null
}

/**
 * Row shape mirrors the `program_state` table (one row per user; primary
 * key is `user_id`, added by the load step).
 *
 * `active_program_id` is a real FK to `programs(id)` and this transform has
 * no way to know that id (it's assigned by Postgres when programs.ts's
 * seed row is inserted) — so it's left `null` here. `active_program_ref`
 * carries the program's `name` ('5/3/1', matching `toProgramSeed().program.name`
 * in programs.ts) as a lookup key: the load step inserts the program first,
 * then resolves `active_program_ref` -> the real program id to fill in
 * `active_program_id` before inserting this row.
 */
export interface ProgramStateRow {
  active_program_id: null
  active_program_ref: string
  cursor: Cursor
  last_advance_key: string | null
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

function settingsMap(raw: RawExport): Map<string, string | number | boolean | null> {
  const map = new Map<string, string | number | boolean | null>()
  for (const row of raw.settings) {
    const key = str(row.Key)
    if (key) map.set(key, row.Value)
  }
  return map
}

/** settings key prefix -> training_maxes key. */
const TM_KEYS: { settingsKey: string; key: TrainingMaxRow['key'] }[] = [
  { settingsKey: 'squat_tm', key: 'squat' },
  { settingsKey: 'bench_tm', key: 'benchPress' },
  { settingsKey: 'barbell_tm', key: 'barbellDeadlift' },
  { settingsKey: 'ohp_tm', key: 'overheadPress' },
]

/**
 * Converts the Settings tab's key/value rows into `training_maxes` rows,
 * one per lift. Each lift's current value comes from `<lift>_tm`; its
 * `prev_value` from the matching `<lift>_tm_prev` key (absent -> null).
 */
export function toTrainingMaxes(raw: RawExport): TrainingMaxRow[] {
  const settings = settingsMap(raw)
  return TM_KEYS.map(({ settingsKey, key }) => ({
    key,
    value: num(settings.get(settingsKey)) ?? 0,
    prev_value: num(settings.get(`${settingsKey}_prev`)),
  }))
}

/**
 * Derives a `program_state` cursor from the Settings tab's flat
 * `program_slot` counter, reusing the 5/3/1 preset's actual shape (2 days,
 * 4 weeks) rather than hardcoding those numbers: `dayIndex` is the slot's
 * position within a day-cycle (`slot % dayCount`), `week` is which
 * week-of-cycle that day-cycle falls in (capped at `weekCount`, matching
 * the deload week reset behavior in programEngine.advanceCursor).
 */
function slotToCursor(slot: number, cycle: number): Cursor {
  const dayCount = fiveThreeOne.days.length
  const weekCount = programWeekCount(fiveThreeOne)
  return {
    dayIndex: slot % dayCount,
    week: Math.min(weekCount, Math.floor(slot / dayCount) + 1),
    cycle,
  }
}

/**
 * Converts the Settings tab's key/value rows into the single `program_state`
 * row for this user. `program_slot` + `cycle_number` derive the cursor;
 * `program_last_advance` is carried through verbatim as `last_advance_key`
 * (its `date|variant` shape, e.g. "2026-07-14|A", is opaque to this
 * transform — whatever consumer reads it owns that parsing).
 */
export function toProgramState(raw: RawExport): ProgramStateRow {
  const settings = settingsMap(raw)
  const slot = num(settings.get('program_slot')) ?? 0
  const cycle = num(settings.get('cycle_number')) ?? 1

  return {
    active_program_id: null,
    active_program_ref: fiveThreeOne.name,
    cursor: slotToCursor(slot, cycle),
    last_advance_key: str(settings.get('program_last_advance')),
  }
}
