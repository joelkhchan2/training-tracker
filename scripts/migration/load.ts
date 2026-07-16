import crypto from 'node:crypto'
import path from 'node:path'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import type { RawExport } from './exportSchema.ts'
import { loadExport } from './loadExport.ts'
import { toExerciseCatalog, buildNameToId, type ExerciseRow } from './transform/exercises.ts'
import { toSessions, type SessionRow, type StrengthSetRow, type ClimbingSendRow, type CardioActivityRow, type CalisthenicsSetRow, type DailyCheckinRow } from './transform/log.ts'
import { toTrainingMaxes, toProgramState, type TrainingMaxRow, type ProgramStateRow } from './transform/programState.ts'
import { toPersonalRecords, toTemplates, type PersonalRecordRow, type TemplateRow } from './transform/records.ts'
import { toProgramSeed, type ProgramRow, type ProgramDayRow, type ProgramExerciseRow } from './transform/programs.ts'

/**
 * Migration LOAD runner: assembles every transform's output into one
 * in-memory graph with real FKs wired up (exercise names -> ids, sessions ->
 * child rows, program -> days -> exercises, everything -> user_id), then
 * either prints a reconciliation report (`--dry-run`, no DB/secrets touched)
 * or upserts it into the hosted Supabase project (real mode, requires a
 * service-role key supplied by the caller's shell env — never read from or
 * printed by this file's own logic beyond existence checks).
 *
 * See scripts/migration/README.md for exact run instructions.
 */

// Used only in --dry-run, where there is no real auth user to resolve.
const DRY_RUN_PLACEHOLDER_USER_ID = '00000000-0000-0000-0000-000000000000'

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

interface Cli {
  dryRun: boolean
  xlsxPath: string
}

function parseArgs(argv: string[]): Cli {
  const args = argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const positional = args.filter(a => a !== '--dry-run')
  const xlsxPath = positional[0]

  if (!xlsxPath) {
    console.error('Usage: npx tsx scripts/migration/load.ts [--dry-run] <path-to-export.xlsx>')
    process.exit(1)
  }

  return { dryRun, xlsxPath }
}

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    console.error(`Missing required env var: ${name}`)
    process.exit(1)
  }
  return value
}

// ---------------------------------------------------------------------------
// Shared name normalization (duplicated from transform/exercises.ts's
// private helper, matching the convention already used by log.ts,
// records.ts, and golden.test.ts, which each keep their own copy rather
// than exporting it).
// ---------------------------------------------------------------------------

function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase()
}

// ---------------------------------------------------------------------------
// Assembly: every transform output, wired with real FKs/user_id/ids.
// ---------------------------------------------------------------------------

type ResolvedProgram = ProgramRow & { id: string }
type ResolvedProgramDay = ProgramDayRow & { id: string; program_id: string }
type ResolvedProgramExercise = Omit<ProgramExerciseRow, 'exerciseName' | 'dayIndex' | 'exercise_id'> & {
  id: string
  program_day_id: string
  exercise_id: string | null
}
interface ResolvedProgramState {
  user_id: string
  active_program_id: string
  cursor: ProgramStateRow['cursor']
  last_advance_key: ProgramStateRow['last_advance_key']
}

interface Assembly {
  userId: string
  exercises: ExerciseRow[]
  createdFromLog: string[]
  program: ResolvedProgram
  programDays: ResolvedProgramDay[]
  programExercises: ResolvedProgramExercise[]
  unresolvedProgramExerciseNames: string[]
  trainingMaxes: (TrainingMaxRow & { user_id: string })[]
  programState: ResolvedProgramState
  sessions: (SessionRow & { user_id: string })[]
  strengthSets: (StrengthSetRow & { user_id: string })[]
  climbingSends: (ClimbingSendRow & { user_id: string })[]
  cardioActivities: (CardioActivityRow & { user_id: string })[]
  calisthenicsSets: (CalisthenicsSetRow & { user_id: string })[]
  dailyCheckins: (DailyCheckinRow & { user_id: string })[]
  personalRecords: (PersonalRecordRow & { user_id: string })[]
  templates: TemplateRow[]
  unmatchedStrengthSetNames: string[]
  duplicatesRemoved: number
}

/**
 * Assembles every transform's output into one in-memory graph for `userId`.
 * Pure/no I/O — safe to call in `--dry-run`. Real-mode-only reconciliation
 * (deduping "created from log" exercises against what's already in the
 * hosted DB) happens separately, after this, in `reconcileExtraExercises`.
 */
function assemble(raw: RawExport, userId: string): Assembly {
  const catalog = toExerciseCatalog(raw)
  const nameToIdResult = buildNameToId(catalog, raw)
  const exercises = [...catalog, ...nameToIdResult.extraRows]

  const programSeed = toProgramSeed()
  const programId = crypto.randomUUID()
  const programDays: ResolvedProgramDay[] = programSeed.days.map(day => ({
    ...day,
    id: crypto.randomUUID(),
    program_id: programId,
  }))

  const unresolvedProgramExerciseNames: string[] = []
  const programExercises: ResolvedProgramExercise[] = programSeed.exercises.map(pe => {
    const day = programDays[pe.dayIndex]
    const exerciseId = nameToIdResult.map.get(normalizeName(pe.exerciseName)) ?? null
    if (!exerciseId) unresolvedProgramExerciseNames.push(pe.exerciseName)

    return {
      id: crypto.randomUUID(),
      program_day_id: day.id,
      exercise_id: exerciseId,
      role_key: pe.role_key,
      order_index: pe.order_index,
      scheme: pe.scheme,
    }
  })

  const program: ResolvedProgram = { ...programSeed.program, id: programId }

  const trainingMaxes = toTrainingMaxes(raw).map(tm => ({ ...tm, user_id: userId }))

  const programStateSeed = toProgramState(raw)
  const programState: ResolvedProgramState = {
    user_id: userId,
    active_program_id: programId,
    cursor: programStateSeed.cursor,
    last_advance_key: programStateSeed.last_advance_key,
  }

  const sessionsResult = toSessions(raw, nameToIdResult)
  const sessions = sessionsResult.sessions.map(s => ({ ...s, user_id: userId }))
  const strengthSets = sessionsResult.strengthSets.map(s => ({ ...s, user_id: userId }))
  const climbingSends = sessionsResult.climbingSends.map(s => ({ ...s, user_id: userId }))
  const cardioActivities = sessionsResult.cardioActivities.map(s => ({ ...s, user_id: userId }))
  const calisthenicsSets = sessionsResult.calisthenicsSets.map(s => ({ ...s, user_id: userId }))
  const dailyCheckins = sessionsResult.dailyCheckins.map(s => ({ ...s, user_id: userId }))

  const personalRecords = toPersonalRecords(raw, nameToIdResult.map).map(pr => ({ ...pr, user_id: userId }))
  const templates = toTemplates(raw)

  return {
    userId,
    exercises,
    createdFromLog: nameToIdResult.createdFromLog,
    program,
    programDays,
    programExercises,
    unresolvedProgramExerciseNames,
    trainingMaxes,
    programState,
    sessions,
    strengthSets,
    climbingSends,
    cardioActivities,
    calisthenicsSets,
    dailyCheckins,
    personalRecords,
    templates,
    unmatchedStrengthSetNames: sessionsResult.unmatched,
    duplicatesRemoved: sessionsResult.duplicatesRemoved,
  }
}

// ---------------------------------------------------------------------------
// FK integrity validation (in-memory only — no DB access).
// ---------------------------------------------------------------------------

function validateAssembly(a: Assembly): string[] {
  const dangling: string[] = []
  const exerciseIds = new Set(a.exercises.map(e => e.id))
  const sessionIds = new Set(a.sessions.map(s => s.id))

  for (const pe of a.programExercises) {
    if (!pe.exercise_id || !exerciseIds.has(pe.exercise_id)) {
      dangling.push(`program_exercises: day=${pe.program_day_id} order=${pe.order_index} has no resolvable exercise_id`)
    }
  }

  a.strengthSets.forEach((s, i) => {
    if (!s.exercise_id || !exerciseIds.has(s.exercise_id)) {
      dangling.push(`strength_sets[${i}]: exercise_id "${String(s.exercise_id)}" not in exercises`)
    }
    if (!sessionIds.has(s.session_id)) {
      dangling.push(`strength_sets[${i}]: session_id "${s.session_id}" not in sessions`)
    }
  })

  a.climbingSends.forEach((c, i) => {
    if (!sessionIds.has(c.session_id)) {
      dangling.push(`climbing_sends[${i}]: session_id "${c.session_id}" not in sessions`)
    }
  })

  a.cardioActivities.forEach((c, i) => {
    if (!sessionIds.has(c.session_id)) {
      dangling.push(`cardio_activities[${i}]: session_id "${c.session_id}" not in sessions`)
    }
  })

  a.personalRecords.forEach((pr, i) => {
    if (!pr.exercise_id || !exerciseIds.has(pr.exercise_id)) {
      dangling.push(`personal_records[${i}]: exercise_id "${String(pr.exercise_id)}" not in exercises`)
    }
  })

  return dangling
}

// ---------------------------------------------------------------------------
// Reconciliation report (shared by dry-run and real mode).
// ---------------------------------------------------------------------------

interface TableCount {
  table: string
  count: number
}

function tableCounts(a: Assembly): TableCount[] {
  return [
    { table: 'exercises', count: a.exercises.length },
    { table: 'programs', count: 1 },
    { table: 'program_days', count: a.programDays.length },
    { table: 'program_exercises', count: a.programExercises.length },
    { table: 'training_maxes', count: a.trainingMaxes.length },
    { table: 'program_state', count: 1 },
    { table: 'sessions', count: a.sessions.length },
    { table: 'strength_sets', count: a.strengthSets.length },
    { table: 'climbing_sends', count: a.climbingSends.length },
    { table: 'cardio_activities', count: a.cardioActivities.length },
    { table: 'calisthenics_sets', count: a.calisthenicsSets.length },
    { table: 'daily_checkins', count: a.dailyCheckins.length },
    { table: 'personal_records', count: a.personalRecords.length },
    { table: 'templates', count: a.templates.length },
  ]
}

/** Real-mode actual write counts, keyed by table name from `tableCounts`. */
type ActualCounts = Record<string, { submitted: number; confirmed: number }>

function printReport(a: Assembly, dangling: string[], mode: 'dry-run' | 'real', actual?: ActualCounts): void {
  const rows = tableCounts(a)
  const label = mode === 'dry-run' ? 'DRY RUN (no DB, no secrets)' : 'REAL LOAD'

  console.log(`\n=== Migration load reconciliation — ${label} ===\n`)
  console.log('table'.padEnd(20) + (actual ? 'submitted / confirmed' : 'rows'))
  console.log('-'.repeat(48))
  for (const { table, count } of rows) {
    const cell = actual?.[table] ? `${actual[table].submitted} / ${actual[table].confirmed}` : String(count)
    console.log(table.padEnd(20) + cell)
  }
  console.log('-'.repeat(48))
  console.log(`createdFromLog exercises (new global rows minted from names not in Exercises_Master): ${a.createdFromLog.length}`)
  console.log(`Training Log duplicate rows removed (double-submit dedup): ${a.duplicatesRemoved}`)
  console.log(`dangling FK count: ${dangling.length}`)

  if (a.unresolvedProgramExerciseNames.length > 0) {
    console.log(`\nprogram_exercise names that did NOT resolve to an exercise_id:`)
    for (const name of a.unresolvedProgramExerciseNames) console.log(`  - ${name}`)
  }
  if (a.unmatchedStrengthSetNames.length > 0) {
    console.log(`\nstrength_set exercise names that did NOT resolve to an exercise_id:`)
    for (const name of a.unmatchedStrengthSetNames) console.log(`  - ${name}`)
  }
  if (dangling.length > 0) {
    console.log('\nDangling references:')
    const shown = dangling.slice(0, 50)
    for (const d of shown) console.log(`  - ${d}`)
    if (dangling.length > shown.length) console.log(`  ...and ${dangling.length - shown.length} more`)
  }
  console.log()
}

// ---------------------------------------------------------------------------
// --dry-run: pure assembly + validation, no DB, no secrets.
// ---------------------------------------------------------------------------

function runDryRun(xlsxPath: string): void {
  const raw = loadExport(xlsxPath)
  const assembly = assemble(raw, DRY_RUN_PLACEHOLDER_USER_ID)
  const dangling = validateAssembly(assembly)
  printReport(assembly, dangling, 'dry-run')

  if (dangling.length > 0) {
    console.error(`Dry run found ${dangling.length} dangling FK reference(s) — see above. Fix before running for real.`)
    process.exitCode = 1
  }
}

// ---------------------------------------------------------------------------
// Real mode: resolve the seed user, upsert idempotently in FK-safe order.
// ---------------------------------------------------------------------------

async function findUserIdByEmail(supabase: SupabaseClient, email: string): Promise<string> {
  const target = email.trim().toLowerCase()
  const perPage = 1000

  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage })
    if (error) throw new Error(`auth.admin.listUsers failed: ${error.message}`)

    const match = data.users.find(u => (u.email ?? '').toLowerCase() === target)
    if (match) return match.id

    if (data.users.length < perPage) break
  }

  throw new Error(
    `No auth user found for SEED_USER_EMAIL="${email}". Create that user first (e.g. via Supabase Studio > Authentication), then re-run.`,
  )
}

/**
 * Real-mode-only fixup: `buildNameToId`'s "extra" (created-from-log)
 * exercise rows each get a fresh `crypto.randomUUID()` on every process
 * run, since that transform has no DB of its own to check against. Re-run
 * the loader for real twice and, left unchecked, those ~15 names would be
 * inserted a second time under new ids. This reconciles against whatever
 * global exercises the hosted DB already has by (normalized) name, drops
 * any extra row that already exists, and remaps every already-resolved
 * exercise_id reference (program_exercises/strength_sets/personal_records)
 * from the dropped row's id to the existing DB row's id. Mutates `a`.
 */
async function reconcileExtraExercises(supabase: SupabaseClient, a: Assembly): Promise<void> {
  if (a.createdFromLog.length === 0) return

  const { data, error } = await supabase.from('exercises').select('id, name').is('user_id', null)
  if (error) throw new Error(`exercises lookup (for extra-exercise reconciliation) failed: ${error.message}`)
  if (!data || data.length === 0) return

  const existingByName = new Map<string, string>()
  for (const row of data) existingByName.set(normalizeName(row.name as string), row.id as string)

  const createdFromLogNames = new Set(a.createdFromLog.map(normalizeName))
  const remap = new Map<string, string>()

  a.exercises = a.exercises.filter(ex => {
    const key = normalizeName(ex.name)
    if (!createdFromLogNames.has(key)) return true // never touch catalog rows

    const existingId = existingByName.get(key)
    if (existingId && existingId !== ex.id) {
      remap.set(ex.id, existingId)
      return false
    }
    return true
  })

  if (remap.size === 0) return

  const applyRemap = (id: string | null): string | null => (id != null && remap.has(id) ? remap.get(id)! : id)
  for (const pe of a.programExercises) pe.exercise_id = applyRemap(pe.exercise_id)
  for (const s of a.strengthSets) s.exercise_id = applyRemap(s.exercise_id)
  for (const pr of a.personalRecords) pr.exercise_id = applyRemap(pr.exercise_id)
}

async function runReal(xlsxPath: string): Promise<void> {
  const url = requireEnv('SUPABASE_URL')
  const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY')
  const seedEmail = requireEnv('SEED_USER_EMAIL')

  const supabase = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } })

  const userId = await findUserIdByEmail(supabase, seedEmail)
  console.log(`Resolved SEED_USER_EMAIL to user_id ${userId}.`)

  const raw = loadExport(xlsxPath)
  const assembly = assemble(raw, userId)

  const dangling = validateAssembly(assembly)
  if (dangling.length > 0) {
    printReport(assembly, dangling, 'real')
    throw new Error(`Aborting before touching the DB: ${dangling.length} dangling FK reference(s) found. See report above.`)
  }

  await reconcileExtraExercises(supabase, assembly)

  const actual: ActualCounts = {}
  const record = (table: string, submitted: number, confirmed: number): void => {
    actual[table] = { submitted, confirmed }
  }

  // 1. exercises (global catalog; stable ids reused verbatim from the source
  // sheet make this upsert naturally idempotent for everything except the
  // "extra" rows already reconciled above).
  {
    const { data, error } = await supabase.from('exercises').upsert(assembly.exercises, { onConflict: 'id' }).select('id')
    if (error) throw new Error(`exercises upsert failed: ${error.message}`)
    record('exercises', assembly.exercises.length, data?.length ?? 0)
  }

  // 2-4. programs / program_days / program_exercises: this schema has no
  // natural-key unique constraint on any of the three, so idempotency is
  // achieved by delete-then-insert scoped to this program's name (cascades
  // remove the old days/exercises automatically per their FK definitions),
  // then a fresh insert with the ids generated above.
  {
    const { error: delErr } = await supabase.from('programs').delete().eq('name', assembly.program.name).is('user_id', null)
    if (delErr) throw new Error(`programs delete (pre-insert) failed: ${delErr.message}`)

    const { error } = await supabase.from('programs').insert([assembly.program])
    if (error) throw new Error(`programs insert failed: ${error.message}`)
    record('programs', 1, 1)
  }
  {
    const { error } = await supabase.from('program_days').insert(assembly.programDays)
    if (error) throw new Error(`program_days insert failed: ${error.message}`)
    record('program_days', assembly.programDays.length, assembly.programDays.length)
  }
  {
    const { error } = await supabase.from('program_exercises').insert(assembly.programExercises)
    if (error) throw new Error(`program_exercises insert failed: ${error.message}`)
    record('program_exercises', assembly.programExercises.length, assembly.programExercises.length)
  }

  // 5. training_maxes
  {
    const { data, error } = await supabase
      .from('training_maxes')
      .upsert(assembly.trainingMaxes, { onConflict: 'user_id,key' })
      .select('id')
    if (error) throw new Error(`training_maxes upsert failed: ${error.message}`)
    record('training_maxes', assembly.trainingMaxes.length, data?.length ?? 0)
  }

  // 6. program_state (primary key IS user_id — no separate id column)
  {
    const { error } = await supabase.from('program_state').upsert([assembly.programState], { onConflict: 'user_id' })
    if (error) throw new Error(`program_state upsert failed: ${error.message}`)
    record('program_state', 1, 1)
  }

  // 7. sessions: upsert on (user_id, client_id) WITHOUT sending our
  // transform-local `id` — on conflict, Postgres would otherwise try to
  // rewrite the existing row's primary key, which fails once any child rows
  // reference it (no ON UPDATE CASCADE on those FKs). The real ids are
  // re-selected afterward to remap the transform-local session_id on every
  // child row below.
  const sessionPayload = assembly.sessions.map(s => ({
    user_id: s.user_id,
    client_id: s.client_id,
    date: s.date,
    session_type: s.session_type,
    discipline: s.discipline,
    body_weight: s.body_weight,
    status: s.status,
  }))
  {
    const { error } = await supabase.from('sessions').upsert(sessionPayload, { onConflict: 'user_id,client_id' })
    if (error) throw new Error(`sessions upsert failed: ${error.message}`)
  }

  const clientIds = assembly.sessions.map(s => s.client_id)
  const { data: sessionRows, error: sessionSelectErr } = await supabase
    .from('sessions')
    .select('id, client_id')
    .eq('user_id', userId)
    .in('client_id', clientIds)
  if (sessionSelectErr) throw new Error(`sessions re-select (for real ids) failed: ${sessionSelectErr.message}`)

  const clientIdToRealId = new Map<string, string>((sessionRows ?? []).map(r => [r.client_id as string, r.id as string]))
  const localIdToRealId = new Map<string, string>(
    assembly.sessions.map(s => [s.id, clientIdToRealId.get(s.client_id) ?? s.id]),
  )
  record('sessions', assembly.sessions.length, sessionRows?.length ?? 0)

  const strengthSetsPayload = assembly.strengthSets.map(s => ({ ...s, session_id: localIdToRealId.get(s.session_id) ?? s.session_id }))
  const climbingSendsPayload = assembly.climbingSends.map(c => ({ ...c, session_id: localIdToRealId.get(c.session_id) ?? c.session_id }))
  const cardioActivitiesPayload = assembly.cardioActivities.map(c => ({ ...c, session_id: localIdToRealId.get(c.session_id) ?? c.session_id }))
  const touchedSessionIds = Array.from(new Set(localIdToRealId.values()))

  // 8. strength_sets / climbing_sends / cardio_activities: no natural-key
  // unique constraint on any of these, so idempotency is achieved by
  // delete-then-insert scoped to the sessions this run touches (full
  // replace of each touched session's children, not an accumulate).
  if (touchedSessionIds.length > 0) {
    const { error } = await supabase.from('strength_sets').delete().in('session_id', touchedSessionIds)
    if (error) throw new Error(`strength_sets delete (pre-insert) failed: ${error.message}`)
  }
  if (strengthSetsPayload.length > 0) {
    const { error } = await supabase.from('strength_sets').insert(strengthSetsPayload)
    if (error) throw new Error(`strength_sets insert failed: ${error.message}`)
  }
  record('strength_sets', strengthSetsPayload.length, strengthSetsPayload.length)

  if (touchedSessionIds.length > 0) {
    const { error } = await supabase.from('climbing_sends').delete().in('session_id', touchedSessionIds)
    if (error) throw new Error(`climbing_sends delete (pre-insert) failed: ${error.message}`)
  }
  if (climbingSendsPayload.length > 0) {
    const { error } = await supabase.from('climbing_sends').insert(climbingSendsPayload)
    if (error) throw new Error(`climbing_sends insert failed: ${error.message}`)
  }
  record('climbing_sends', climbingSendsPayload.length, climbingSendsPayload.length)

  if (touchedSessionIds.length > 0) {
    const { error } = await supabase.from('cardio_activities').delete().in('session_id', touchedSessionIds)
    if (error) throw new Error(`cardio_activities delete (pre-insert) failed: ${error.message}`)
  }
  if (cardioActivitiesPayload.length > 0) {
    const { error } = await supabase.from('cardio_activities').insert(cardioActivitiesPayload)
    if (error) throw new Error(`cardio_activities insert failed: ${error.message}`)
  }
  record('cardio_activities', cardioActivitiesPayload.length, cardioActivitiesPayload.length)

  // calisthenics_sets
  {
    const { data, error } = await supabase
      .from('calisthenics_sets')
      .upsert(assembly.calisthenicsSets, { onConflict: 'user_id,client_id' })
      .select('id')
    if (error) throw new Error(`calisthenics_sets upsert failed: ${error.message}`)
    record('calisthenics_sets', assembly.calisthenicsSets.length, data?.length ?? 0)
  }

  // daily_checkins
  {
    const { data, error } = await supabase
      .from('daily_checkins')
      .upsert(assembly.dailyCheckins, { onConflict: 'user_id,date' })
      .select('id')
    if (error) throw new Error(`daily_checkins upsert failed: ${error.message}`)
    record('daily_checkins', assembly.dailyCheckins.length, data?.length ?? 0)
  }

  // 9. personal_records
  {
    const { data, error } = await supabase
      .from('personal_records')
      .upsert(assembly.personalRecords, { onConflict: 'user_id,exercise_id,pr_type' })
      .select('id')
    if (error) throw new Error(`personal_records upsert failed: ${error.message}`)
    record('personal_records', assembly.personalRecords.length, data?.length ?? 0)
  }

  // 10. templates: no natural-key unique constraint; delete-then-insert
  // scoped to the preset names this run brings, same rationale as programs.
  {
    const names = assembly.templates.map(t => t.name)
    if (names.length > 0) {
      const { error: delErr } = await supabase.from('templates').delete().is('user_id', null).in('name', names)
      if (delErr) throw new Error(`templates delete (pre-insert) failed: ${delErr.message}`)
    }
    if (assembly.templates.length > 0) {
      const { error } = await supabase.from('templates').insert(assembly.templates)
      if (error) throw new Error(`templates insert failed: ${error.message}`)
    }
    record('templates', assembly.templates.length, assembly.templates.length)
  }

  printReport(assembly, [], 'real', actual)
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const { dryRun, xlsxPath } = parseArgs(process.argv)
  const resolvedPath = path.resolve(process.cwd(), xlsxPath)

  if (dryRun) {
    runDryRun(resolvedPath)
    return
  }

  await runReal(resolvedPath)
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
})
