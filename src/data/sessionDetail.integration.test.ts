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

describe.skipIf(!anon)('session detail RLS', () => {
  it('does not let one user read another user\'s session row', async () => {
    const a = await makeUser(`detail_a_${Date.now()}@test.dev`)
    const b = await makeUser(`detail_b_${Date.now()}@test.dev`)
    const { data: aSession } = await a.client.rpc('log_cardio', {
      p_client_id: `a-${Date.now()}`, p_date: '2026-07-24', p_activity: 'Run',
      p_duration_minutes: 30, p_distance_km: 5, p_notes: null,
    })
    const { data: bSeesA } = await b.client
      .from('sessions').select('id').eq('id', aSession as string)
    expect(bSeesA).toEqual([]) // RLS: B sees none of A's sessions → hook would return null
  })
})
