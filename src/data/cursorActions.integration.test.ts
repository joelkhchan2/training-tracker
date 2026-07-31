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

describe.skipIf(!anon)('cursor writes (skip/pick) via program_state', () => {
  it('a user can update only their own program_state cursor (RLS)', async () => {
    const a = await makeUser(`cur_a_${Date.now()}@test.dev`)
    const b = await makeUser(`cur_b_${Date.now()}@test.dev`)
    await a.client.from('program_state').insert({ user_id: a.userId, cursor: { dayIndex: 0, week: 1, cycle: 1 }, last_advance_key: null })

    // A updates its own cursor.
    const { error: aErr } = await a.client.from('program_state').update({ cursor: { dayIndex: 2, week: 1, cycle: 1 } }).eq('user_id', a.userId)
    expect(aErr).toBeNull()
    const after = await a.client.from('program_state').select('cursor').eq('user_id', a.userId).single()
    expect(after.data!.cursor).toEqual({ dayIndex: 2, week: 1, cycle: 1 })

    // B cannot write A's row (RLS filters the update to 0 rows; A's cursor is unchanged).
    await b.client.from('program_state').update({ cursor: { dayIndex: 9, week: 9, cycle: 9 } }).eq('user_id', a.userId)
    const stillA = await a.client.from('program_state').select('cursor').eq('user_id', a.userId).single()
    expect(stillA.data!.cursor).toEqual({ dayIndex: 2, week: 1, cycle: 1 })
  })
})
