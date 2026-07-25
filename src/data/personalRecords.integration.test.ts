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

    for (const table of ['personal_records', 'climbing_sends']) {
      const { data: aSees } = await a.client.from(table).select('*').eq('user_id', a.userId)
      expect((aSees ?? []).length).toBeGreaterThan(0) // A sees its own rows
      const { data: bSees } = await b.client.from(table).select('*').eq('user_id', a.userId)
      expect(bSees).toEqual([]) // RLS: B sees none of A's rows
    }
  })
})
