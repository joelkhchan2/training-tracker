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
})
