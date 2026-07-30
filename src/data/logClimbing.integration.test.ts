// src/data/logClimbing.integration.test.ts
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

describe.skipIf(!anon)('log_climbing RPC', () => {
  it('inserts a climbing session + sends, idempotent on replay', async () => {
    const { client, userId } = await makeUser(`climb_${Date.now()}@test.dev`)
    const clientId = `climb-${Date.now()}`
    const sends = [{ grade: 'V2', count: 3 }, { grade: 'V4', count: 1 }]

    const { data: res, error } = await client.rpc('log_climbing', {
      p_client_id: clientId, p_date: '2026-07-23', p_notes: 'crimpy', p_sends: sends,
    })
    expect(error).toBeNull()
    const sessionId = (res as { session_id: string }).session_id
    expect(sessionId).toBeTruthy()

    // Replay same client_id: same session, sends replaced not duplicated.
    const { data: res2, error: err2 } = await client.rpc('log_climbing', {
      p_client_id: clientId, p_date: '2026-07-23', p_notes: 'crimpy',
      p_sends: [{ grade: 'V2', count: 5 }],
    })
    expect(err2).toBeNull()
    expect((res2 as { session_id: string }).session_id).toBe(sessionId)

    const { data: sessions } = await client
      .from('sessions').select('id, discipline').eq('user_id', userId)
    expect(sessions).toHaveLength(1)
    expect(sessions![0].discipline).toBe('climbing')

    const { data: rows } = await client
      .from('climbing_sends').select('grade, count').eq('session_id', sessionId)
    expect(rows).toHaveLength(1) // replaced
    expect(rows![0]).toMatchObject({ grade: 'V2', count: 5 })
  })

  it('detects a new max-grade PR, persists it, and reports it (idempotent)', async () => {
    const { client, userId } = await makeUser(`climbpr_${Date.now()}@test.dev`)
    const clientId = `climbpr-${Date.now()}`

    const { data: res } = await client.rpc('log_climbing', {
      p_client_id: clientId, p_date: '2026-07-23', p_notes: null,
      p_sends: [{ grade: 'V3', count: 2 }, { grade: 'V5', count: 1 }],
    })
    // No prior PR row for a fresh user -> first max is a PR.
    expect((res as { new_max_grade: number | null }).new_max_grade).toBe(5)
    expect((res as { previous_max_grade: number | null }).previous_max_grade).toBeNull()

    // PR row persisted, keyed to the global Climbing exercise, stamped with the session date.
    const { data: prs } = await client
      .from('personal_records').select('value, previous_value, date_achieved, session_id')
      .eq('user_id', userId).eq('pr_type', 'max_v_grade')
    expect(prs).toHaveLength(1)
    expect(Number(prs![0].value)).toBe(5)

    // Replay of the same winning save still reports the PR (replay-safe celebration).
    const { data: replay } = await client.rpc('log_climbing', {
      p_client_id: clientId, p_date: '2026-07-23', p_notes: null,
      p_sends: [{ grade: 'V3', count: 2 }, { grade: 'V5', count: 1 }],
    })
    expect((replay as { new_max_grade: number | null }).new_max_grade).toBe(5)
  })

  it('does not report a PR when the session does not beat the stored max', async () => {
    const { client } = await makeUser(`climbnopr_${Date.now()}@test.dev`)
    // First save sets max to V5.
    await client.rpc('log_climbing', {
      p_client_id: `a-${Date.now()}`, p_date: '2026-07-23', p_notes: null,
      p_sends: [{ grade: 'V5', count: 1 }],
    })
    // Second, separate session tops out at V4 -> no PR.
    const { data: res } = await client.rpc('log_climbing', {
      p_client_id: `b-${Date.now()}`, p_date: '2026-07-24', p_notes: null,
      p_sends: [{ grade: 'V4', count: 2 }],
    })
    expect((res as { new_max_grade: number | null }).new_max_grade).toBeNull()
    expect((res as { previous_max_grade: number | null }).previous_max_grade).toBe(5)
  })

  it('rejects an empty send set', async () => {
    const { client } = await makeUser(`climbempty_${Date.now()}@test.dev`)
    const { error } = await client.rpc('log_climbing', {
      p_client_id: `e-${Date.now()}`, p_date: '2026-07-23', p_notes: null, p_sends: [],
    })
    expect(error).not.toBeNull()
  })

  it('does not let one user read another user\'s climbing sends', async () => {
    const a = await makeUser(`climb_a_${Date.now()}@test.dev`)
    const b = await makeUser(`climb_b_${Date.now()}@test.dev`)
    const { data: res } = await a.client.rpc('log_climbing', {
      p_client_id: `a-${Date.now()}`, p_date: '2026-07-23', p_notes: null,
      p_sends: [{ grade: 'V3', count: 1 }],
    })
    const aSession = (res as { session_id: string }).session_id
    const { data: bSeesA } = await b.client
      .from('climbing_sends').select('*').eq('session_id', aSession)
    expect(bSeesA).toEqual([]) // RLS
  })

  it('stores attempts and clamps attempts up to count', async () => {
    const { userId, client } = await makeUser(`climbatt_${Date.now()}@test.dev`)
    const { data: res } = await client.rpc('log_climbing', {
      p_client_id: `att-${Date.now()}`, p_date: '2026-07-27', p_notes: null,
      // V4: more attempts than sends; V5: attempts omitted-too-low -> clamped up to count.
      p_sends: [{ grade: 'V4', count: 1, attempts: 6 }, { grade: 'V5', count: 2, attempts: 0 }],
    })
    const sessionId = (res as { session_id: string }).session_id
    const { data: rows } = await client
      .from('climbing_sends').select('grade, count, attempts').eq('session_id', sessionId)
    const byGrade = Object.fromEntries((rows ?? []).map(r => [r.grade, r]))
    expect(byGrade['V4']).toMatchObject({ count: 1, attempts: 6 })
    expect(byGrade['V5']).toMatchObject({ count: 2, attempts: 2 }) // clamped up
    expect(userId).toBeTruthy()
  })

  it('saves a projecting-only session (attempts, zero sends) and sets no PR', async () => {
    const { client } = await makeUser(`climbproj_${Date.now()}@test.dev`)
    const { data: res, error } = await client.rpc('log_climbing', {
      p_client_id: `proj-${Date.now()}`, p_date: '2026-07-27', p_notes: null,
      p_sends: [{ grade: 'V7', count: 0, attempts: 8 }],
    })
    expect(error).toBeNull()
    expect((res as { new_max_grade: number | null }).new_max_grade).toBeNull()
    const sessionId = (res as { session_id: string }).session_id
    const { data: rows } = await client
      .from('climbing_sends').select('grade, count, attempts').eq('session_id', sessionId)
    expect(rows).toHaveLength(1)
    expect(rows![0]).toMatchObject({ grade: 'V7', count: 0, attempts: 8 })
  })

  it('advances program_state.cursor when p_next_cursor is passed, gated by last_advance_key', async () => {
    const { client, userId } = await makeUser(`climb_adv_${Date.now()}@test.dev`)
    await client.from('program_state').insert({
      user_id: userId, cursor: { dayIndex: 0, week: 1, cycle: 1 }, last_advance_key: null,
    })

    await client.rpc('log_climbing', {
      p_client_id: `kadv-${Date.now()}`, p_date: '2026-07-30', p_notes: null,
      p_sends: [{ grade: 'V4', count: 1 }],
      p_next_cursor: { dayIndex: 1, week: 1, cycle: 1 }, p_last_advance_key: '1-1-1',
    })
    const after1 = await client.from('program_state').select('cursor, last_advance_key').eq('user_id', userId).single()
    expect(after1.data!.cursor).toEqual({ dayIndex: 1, week: 1, cycle: 1 })
    expect(after1.data!.last_advance_key).toBe('1-1-1')

    // Same key, different cursor -> no-op gate.
    await client.rpc('log_climbing', {
      p_client_id: `kadv2-${Date.now()}`, p_date: '2026-07-30', p_notes: null,
      p_sends: [{ grade: 'V4', count: 1 }],
      p_next_cursor: { dayIndex: 5, week: 5, cycle: 5 }, p_last_advance_key: '1-1-1',
    })
    const after2 = await client.from('program_state').select('cursor').eq('user_id', userId).single()
    expect(after2.data!.cursor).toEqual({ dayIndex: 1, week: 1, cycle: 1 })
  })

  it('does NOT touch program_state when no cursor params are passed (ad-hoc parity)', async () => {
    const { client, userId } = await makeUser(`climb_noadv_${Date.now()}@test.dev`)
    await client.from('program_state').insert({
      user_id: userId, cursor: { dayIndex: 0, week: 1, cycle: 1 }, last_advance_key: null,
    })
    await client.rpc('log_climbing', {
      p_client_id: `knoadv-${Date.now()}`, p_date: '2026-07-30', p_notes: null,
      p_sends: [{ grade: 'V2', count: 1 }],
    })
    const after = await client.from('program_state').select('cursor').eq('user_id', userId).single()
    expect(after.data!.cursor).toEqual({ dayIndex: 0, week: 1, cycle: 1 })
  })
})
