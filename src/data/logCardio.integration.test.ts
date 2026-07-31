// src/data/logCardio.integration.test.ts
/// <reference types="node" />
import { describe, it, expect } from 'vitest'
import { createClient } from '@supabase/supabase-js'

const url = process.env.VITE_SUPABASE_URL ?? 'http://127.0.0.1:54321'
const anon = process.env.VITE_SUPABASE_ANON_KEY

async function makeUser(email: string) {
  const c = createClient(url, anon!, { auth: { storageKey: `sb-test-${email}` } })
  await c.auth.signUp({ email, password: 'passw0rd!' })
  const { data } = await c.auth.signInWithPassword({ email, password: 'passw0rd!' })
  return { client: c, userId: data.user!.id }
}

// Requires a running Supabase stack with VITE_SUPABASE_ANON_KEY set. Skips locally
// when that env is absent so `npm run test` stays green; CI runs it with env sourced.
describe.skipIf(!anon)('log_cardio RPC', () => {
  it('inserts a cardio session + one activity, and stays idempotent on replay', async () => {
    const { client, userId } = await makeUser(`cardio_${Date.now()}@test.dev`)
    const clientId = `cardio-${Date.now()}`

    const { data: sessionId, error } = await client.rpc('log_cardio', {
      p_client_id: clientId,
      p_date: '2026-07-21',
      p_activity: 'Run',
      p_duration_minutes: 32,
      p_distance_km: 5.2,
      p_notes: 'easy zone-2',
    })
    expect(error).toBeNull()
    expect(sessionId).toBeTruthy()

    // Replay with the SAME client_id must return the same session and not duplicate.
    const { data: replayId, error: replayErr } = await client.rpc('log_cardio', {
      p_client_id: clientId,
      p_date: '2026-07-21',
      p_activity: 'Run',
      p_duration_minutes: 33,
      p_distance_km: 5.2,
      p_notes: 'easy zone-2',
    })
    expect(replayErr).toBeNull()
    expect(replayId).toBe(sessionId)

    const { data: sessions } = await client
      .from('sessions').select('id, discipline, duration_minutes').eq('user_id', userId)
    expect(sessions).toHaveLength(1)
    expect(sessions![0].discipline).toBe('cardio')
    expect(sessions![0].duration_minutes).toBe(33) // updated on replay

    const { data: acts } = await client
      .from('cardio_activities').select('activity, distance_km, duration_minutes').eq('session_id', sessionId)
    expect(acts).toHaveLength(1) // deleted-and-reinserted, not duplicated
    expect(acts![0].activity).toBe('Run')
  })

  it('does not let one user read another user\'s cardio activities', async () => {
    const a = await makeUser(`cardio_a_${Date.now()}@test.dev`)
    const b = await makeUser(`cardio_b_${Date.now()}@test.dev`)

    const { data: aSession } = await a.client.rpc('log_cardio', {
      p_client_id: `a-${Date.now()}`, p_date: '2026-07-21', p_activity: 'Bike',
      p_duration_minutes: 45, p_distance_km: 18, p_notes: null,
    })

    const { data: bSeesA } = await b.client
      .from('cardio_activities').select('*').eq('session_id', aSession as string)
    expect(bSeesA).toEqual([]) // RLS: B sees none of A's activities
  })

  it('advances program_state.cursor when p_next_cursor is passed, and is gated by last_advance_key', async () => {
    const { client, userId } = await makeUser(`cardio_adv_${Date.now()}@test.dev`)

    // Seed a program_state row for this user (advance updates it in place).
    await client.from('program_state').insert({
      user_id: userId,
      cursor: { dayIndex: 0, week: 1, cycle: 1 },
      last_advance_key: null,
    })

    // First advance (stored key null -> applies).
    await client.rpc('log_cardio', {
      p_client_id: `cadv-${Date.now()}`, p_date: '2026-07-30', p_activity: 'Run',
      p_duration_minutes: 30, p_distance_km: 5, p_notes: null,
      p_next_cursor: { dayIndex: 1, week: 1, cycle: 1 }, p_last_advance_key: '1-1-1',
    })
    const after1 = await client.from('program_state').select('cursor, last_advance_key').eq('user_id', userId).single()
    expect(after1.data!.cursor).toEqual({ dayIndex: 1, week: 1, cycle: 1 })
    expect(after1.data!.last_advance_key).toBe('1-1-1')

    // Replay with the SAME last_advance_key but a DIFFERENT cursor -> gate makes it a no-op.
    await client.rpc('log_cardio', {
      p_client_id: `cadv2-${Date.now()}`, p_date: '2026-07-30', p_activity: 'Run',
      p_duration_minutes: 30, p_distance_km: 5, p_notes: null,
      p_next_cursor: { dayIndex: 9, week: 9, cycle: 9 }, p_last_advance_key: '1-1-1',
    })
    const after2 = await client.from('program_state').select('cursor').eq('user_id', userId).single()
    expect(after2.data!.cursor).toEqual({ dayIndex: 1, week: 1, cycle: 1 }) // unchanged
  })

  it('does NOT touch program_state when no cursor params are passed (ad-hoc parity)', async () => {
    const { client, userId } = await makeUser(`cardio_noadv_${Date.now()}@test.dev`)
    await client.from('program_state').insert({
      user_id: userId, cursor: { dayIndex: 0, week: 1, cycle: 1 }, last_advance_key: null,
    })
    await client.rpc('log_cardio', {
      p_client_id: `cnoadv-${Date.now()}`, p_date: '2026-07-30', p_activity: 'Bike',
      p_duration_minutes: 20, p_distance_km: 8, p_notes: null,
    })
    const after = await client.from('program_state').select('cursor').eq('user_id', userId).single()
    expect(after.data!.cursor).toEqual({ dayIndex: 0, week: 1, cycle: 1 })
  })
})
