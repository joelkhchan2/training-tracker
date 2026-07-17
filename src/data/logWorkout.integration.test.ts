/// <reference types="node" />
import { describe, it, expect } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = process.env.VITE_SUPABASE_URL ?? 'http://127.0.0.1:54321'
const anon = process.env.VITE_SUPABASE_ANON_KEY

async function makeUser(email: string) {
  // jsdom's localStorage is shared across every createClient() call in this
  // test file (one "browser context"), so distinct GoTrueClient instances
  // must use distinct storageKeys or their sessions clobber each other via
  // the cross-tab storage-sync listener.
  const c = createClient(url, anon!, { auth: { storageKey: `sb-test-${email}` } })
  await c.auth.signUp({ email, password: 'passw0rd!' })
  const { data } = await c.auth.signInWithPassword({ email, password: 'passw0rd!' })
  return { client: c, userId: data.user!.id }
}

// Each test user needs a valid exercise_id to reference from strength_sets.
// Insert a custom exercise owned by that user (satisfies the "insert own" RLS
// policy on exercises) rather than depending on any seeded/global catalog row.
async function makeExercise(client: SupabaseClient, userId: string) {
  const { data, error } = await client
    .from('exercises')
    .insert({ user_id: userId, name: `Test Exercise ${userId.slice(0, 8)}` })
    .select('id')
    .single()
  if (error) throw error
  return data.id as string
}

// exercise_progress.program_id is a FK into programs, so tests that exercise
// p_progress need a real program row owned by the user (satisfies the
// "programs - write own" RLS policy on insert).
async function makeProgram(client: SupabaseClient, userId: string) {
  const { data, error } = await client
    .from('programs')
    .insert({ user_id: userId, name: `Test Program ${userId.slice(0, 8)}` })
    .select('id')
    .single()
  if (error) throw error
  return data.id as string
}

function twoSets(exerciseId: string) {
  return [
    { exercise_id: exerciseId, set_number: 1, weight: 135, reps: 5, rpe: 7, is_warmup: false, order_index: 0 },
    { exercise_id: exerciseId, set_number: 2, weight: 145, reps: 5, rpe: 8, is_warmup: false, order_index: 1 },
  ]
}

// Requires a running Supabase stack with VITE_SUPABASE_ANON_KEY set. Skips locally
// when that env is absent so `npm run test` stays green; CI runs it with env sourced.
describe.skipIf(!anon)('log_workout RPC', () => {
  it('advances the caller\'s program_state cursor atomically with the save, and stays idempotent on replay', async () => {
    const user = await makeUser(`logwk_cursor_${Date.now()}@test.dev`)
    const exerciseId = await makeExercise(user.client, user.userId)
    const clientId = `session-${Date.now()}`
    const session = { discipline: 'strength', session_type: 'A', date: '2026-07-16', status: 'active' }
    const sets = twoSets(exerciseId)

    // Seed a program_state row — the RPC only UPDATEs (mirrors what useActiveWorkout
    // already required to exist before a save could ever be triggered).
    const seedCursor = { dayIndex: 0, week: 1, cycle: 1 }
    const { error: seedError } = await user.client
      .from('program_state')
      .insert({ user_id: user.userId, cursor: seedCursor })
    expect(seedError).toBeNull()

    const nextCursor = { dayIndex: 1, week: 1, cycle: 1 }
    const lastAdvanceKey = '1-1-1'

    const first = await user.client.rpc('log_workout', {
      p_client_id: clientId,
      p_session: session,
      p_sets: sets,
      p_next_cursor: nextCursor,
      p_last_advance_key: lastAdvanceKey,
    })
    expect(first.error).toBeNull()
    const sessionId = first.data as string

    const { data: stateAfterFirst } = await user.client
      .from('program_state')
      .select('cursor, last_advance_key')
      .eq('user_id', user.userId)
      .single()
    expect(stateAfterFirst?.cursor).toEqual(nextCursor)
    expect(stateAfterFirst?.last_advance_key).toBe(lastAdvanceKey)

    // Re-applying the same next_cursor (e.g. a client retry after a dropped response)
    // must be idempotent: same session, same set count, same cursor value — no
    // double-advance.
    const second = await user.client.rpc('log_workout', {
      p_client_id: clientId,
      p_session: session,
      p_sets: sets,
      p_next_cursor: nextCursor,
      p_last_advance_key: lastAdvanceKey,
    })
    expect(second.error).toBeNull()
    expect(second.data).toBe(sessionId)

    const { data: stateAfterSecond } = await user.client
      .from('program_state')
      .select('cursor, last_advance_key')
      .eq('user_id', user.userId)
      .single()
    expect(stateAfterSecond?.cursor).toEqual(nextCursor)
    expect(stateAfterSecond?.last_advance_key).toBe(lastAdvanceKey)

    const { data: setRows } = await user.client
      .from('strength_sets')
      .select('id')
      .eq('session_id', sessionId)
    expect(setRows).toHaveLength(2)
  })

  it('is idempotent: calling twice with the same client_id yields one session + the sets, not duplicates', async () => {
    const user = await makeUser(`logwk_idempotent_${Date.now()}@test.dev`)
    const exerciseId = await makeExercise(user.client, user.userId)
    const clientId = `session-${Date.now()}`
    const session = { discipline: 'strength', session_type: 'A', date: '2026-07-16', status: 'active' }
    const sets = twoSets(exerciseId)

    const first = await user.client.rpc('log_workout', {
      p_client_id: clientId,
      p_session: session,
      p_sets: sets,
    })
    expect(first.error).toBeNull()
    const sessionId = first.data as string
    expect(sessionId).toBeTruthy()

    const second = await user.client.rpc('log_workout', {
      p_client_id: clientId,
      p_session: session,
      p_sets: sets,
    })
    expect(second.error).toBeNull()
    expect(second.data).toBe(sessionId) // same session row, not a new one

    const { data: sessionRows } = await user.client
      .from('sessions')
      .select('id')
      .eq('user_id', user.userId)
      .eq('client_id', clientId)
    expect(sessionRows).toHaveLength(1)

    const { data: setRows } = await user.client
      .from('strength_sets')
      .select('id, set_number')
      .eq('session_id', sessionId)
    expect(setRows).toHaveLength(2) // re-save replaced, did not duplicate, the sets
  })

  it('enforces user isolation: each call only ever writes rows under the caller\'s own uid', async () => {
    const a = await makeUser(`logwk_isolation_a_${Date.now()}@test.dev`)
    const b = await makeUser(`logwk_isolation_b_${Date.now()}@test.dev`)
    const exerciseA = await makeExercise(a.client, a.userId)
    const exerciseB = await makeExercise(b.client, b.userId)
    const clientId = `shared-client-id-${Date.now()}` // same client_id string, different users

    const aResult = await a.client.rpc('log_workout', {
      p_client_id: clientId,
      p_session: { discipline: 'strength', status: 'active' },
      p_sets: twoSets(exerciseA),
    })
    expect(aResult.error).toBeNull()
    const aSessionId = aResult.data as string

    const bResult = await b.client.rpc('log_workout', {
      p_client_id: clientId,
      p_session: { discipline: 'strength', status: 'active' },
      p_sets: twoSets(exerciseB),
    })
    expect(bResult.error).toBeNull()
    const bSessionId = bResult.data as string

    // Distinct sessions, even though client_id collides across users.
    expect(bSessionId).not.toBe(aSessionId)

    // A cannot see B's session (RLS), and vice versa.
    const { data: aSeesB } = await a.client
      .from('sessions').select('*').eq('id', bSessionId)
    expect(aSeesB).toEqual([])

    const { data: bSeesA } = await b.client
      .from('sessions').select('*').eq('id', aSessionId)
    expect(bSeesA).toEqual([])

    // Each user's session row is owned by their own uid.
    const { data: aOwnSession } = await a.client
      .from('sessions').select('user_id').eq('id', aSessionId).single()
    expect(aOwnSession?.user_id).toBe(a.userId)

    const { data: bOwnSession } = await b.client
      .from('sessions').select('user_id').eq('id', bSessionId).single()
    expect(bOwnSession?.user_id).toBe(b.userId)
  })

  it('upserts exercise_progress atomically with the save, and stays idempotent on replay', async () => {
    const user = await makeUser(`logwk_progress_${Date.now()}@test.dev`)
    const exerciseId = await makeExercise(user.client, user.userId)
    const programId = await makeProgram(user.client, user.userId)
    const clientId = `session-progress-${Date.now()}`
    const session = { discipline: 'strength', session_type: 'A', date: '2026-07-16', status: 'active' }
    const sets = twoSets(exerciseId)
    const progress = [
      { program_id: programId, exercise_id: exerciseId, current_weight: 135, consecutive_fails: 0 },
    ]

    const first = await user.client.rpc('log_workout', {
      p_client_id: clientId,
      p_session: session,
      p_sets: sets,
      p_progress: progress,
    })
    expect(first.error).toBeNull()

    const { data: progressAfterFirst } = await user.client
      .from('exercise_progress')
      .select('user_id, program_id, exercise_id, current_weight, consecutive_fails')
      .eq('user_id', user.userId)
    expect(progressAfterFirst).toHaveLength(1)
    expect(progressAfterFirst?.[0]).toMatchObject({
      user_id: user.userId,
      program_id: programId,
      exercise_id: exerciseId,
      current_weight: 135,
      consecutive_fails: 0,
    })

    // Re-calling with an updated progress payload (same client_id, same
    // program/exercise) must UPDATE the same row, not insert a second one.
    const updatedProgress = [
      { program_id: programId, exercise_id: exerciseId, current_weight: 140, consecutive_fails: 1 },
    ]
    const second = await user.client.rpc('log_workout', {
      p_client_id: clientId,
      p_session: session,
      p_sets: sets,
      p_progress: updatedProgress,
    })
    expect(second.error).toBeNull()

    const { data: progressAfterSecond } = await user.client
      .from('exercise_progress')
      .select('user_id, program_id, exercise_id, current_weight, consecutive_fails')
      .eq('user_id', user.userId)
    expect(progressAfterSecond).toHaveLength(1) // still one row per (user, program, exercise)
    expect(progressAfterSecond?.[0]).toMatchObject({
      user_id: user.userId,
      program_id: programId,
      exercise_id: exerciseId,
      current_weight: 140,
      consecutive_fails: 1,
    })
  })

  it('keeps exercise_progress rows RLS-scoped to their owning user', async () => {
    const a = await makeUser(`logwk_progress_isolation_a_${Date.now()}@test.dev`)
    const b = await makeUser(`logwk_progress_isolation_b_${Date.now()}@test.dev`)
    const exerciseA = await makeExercise(a.client, a.userId)
    const programA = await makeProgram(a.client, a.userId)

    const aResult = await a.client.rpc('log_workout', {
      p_client_id: `progress-isolation-${Date.now()}`,
      p_session: { discipline: 'strength', status: 'active' },
      p_sets: twoSets(exerciseA),
      p_progress: [
        { program_id: programA, exercise_id: exerciseA, current_weight: 100, consecutive_fails: 0 },
      ],
    })
    expect(aResult.error).toBeNull()

    // B cannot see A's exercise_progress row (RLS), even querying unfiltered.
    const { data: bSeesA } = await b.client
      .from('exercise_progress')
      .select('*')
      .eq('program_id', programA)
    expect(bSeesA).toEqual([])

    const { data: aOwnProgress } = await a.client
      .from('exercise_progress')
      .select('user_id')
      .eq('program_id', programA)
      .single()
    expect(aOwnProgress?.user_id).toBe(a.userId)
  })
})
