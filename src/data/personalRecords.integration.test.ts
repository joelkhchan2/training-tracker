/// <reference types="node" />
import { describe, it, expect } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { buildClimbingRecord } from './personalRecords'
const url = process.env.VITE_SUPABASE_URL ?? 'http://127.0.0.1:54321'
const anon = process.env.VITE_SUPABASE_ANON_KEY
async function makeUser(email: string) {
  const c = createClient(url, anon!, { auth: { storageKey: `sb-test-${email}` } })
  await c.auth.signUp({ email, password: 'passw0rd!' })
  const { data } = await c.auth.signInWithPassword({ email, password: 'passw0rd!' })
  return { client: c, userId: data.user!.id }
}
describe.skipIf(!anon)('personal records RLS', () => {
  it('scopes personal_records and climbing_sends to the owner (with real A-owned rows)', async () => {
    const a = await makeUser(`pr_a_${Date.now()}@test.dev`)
    const b = await makeUser(`pr_b_${Date.now()}@test.dev`)

    // A writes owner-scoped rows: log_climbing creates climbing_sends + a max_v_grade PR row.
    const { error: logErr } = await a.client.rpc('log_climbing', {
      p_client_id: `pr-${Date.now()}`, p_date: '2026-07-24', p_notes: null,
      p_sends: [{ grade: 'V3', count: 1 }],
    })
    expect(logErr).toBeNull()

    // A also writes a cardio_activities row via log_cardio, so the loop below can prove RLS
    // scopes this third table too. strength_sets remains a separate, pre-existing gap in this
    // loop — not something this spec closes.
    const { error: cardioLogErr } = await a.client.rpc('log_cardio', {
      p_client_id: `cardio-${Date.now()}`, p_date: '2026-07-24', p_activity: 'Run',
      p_duration_minutes: 30, p_distance_km: 5, p_notes: null,
    })
    expect(cardioLogErr).toBeNull()

    for (const table of ['personal_records', 'climbing_sends', 'cardio_activities']) {
      const { data: aSees } = await a.client.from(table).select('*').eq('user_id', a.userId)
      expect((aSees ?? []).length).toBeGreaterThan(0) // A sees its own rows
      const { data: bSees } = await b.client.from(table).select('*').eq('user_id', a.userId)
      expect(bSees).toEqual([]) // RLS: B sees none of A's rows
    }
  })

  it('ignores a projecting-only (count=0) grade when deriving the climbing max-grade PR', async () => {
    const { client, userId } = await makeUser(`prclimb_${Date.now()}@test.dev`)

    // Real send at a modest grade -> this is the only session that should ever set/feed a PR.
    const { error: sendErr } = await client.rpc('log_climbing', {
      p_client_id: `send-${Date.now()}`, p_date: '2026-07-26', p_notes: null,
      p_sends: [{ grade: 'V3', count: 1, attempts: 1 }],
    })
    expect(sendErr).toBeNull()

    // Separate projecting-only session at a HIGHER grade — attempted, never sent.
    const { error: projErr } = await client.rpc('log_climbing', {
      p_client_id: `proj-${Date.now()}`, p_date: '2026-07-26', p_notes: null,
      p_sends: [{ grade: 'V7', count: 0, attempts: 8 }],
    })
    expect(projErr).toBeNull()

    // Read personal records the same way usePersonalRecords does: seeded max_v_grade PR row
    // plus live climbing_sends grades, filtered to count > 0 (the fix under test).
    const { data: prs } = await client
      .from('personal_records').select('value').eq('user_id', userId).eq('pr_type', 'max_v_grade')
    const seededMaxGrade = prs && prs.length > 0 ? Number(prs[0].value) : null

    const { data: sends } = await client
      .from('climbing_sends').select('grade').eq('user_id', userId).gt('count', 0)
    const liveGrades = (sends ?? []).map((r) => r.grade as string)

    // The projecting V7 must never surface as a PR: not via the RPC's own PR row, and not
    // via the raw climbing_sends read that feeds buildClimbingRecord on the Progress tab.
    expect(liveGrades).toEqual(['V3'])
    expect(buildClimbingRecord(seededMaxGrade, liveGrades)).toBe(3)
  })
})
