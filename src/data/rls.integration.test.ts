/// <reference types="node" />
import { describe, it, expect } from 'vitest'
import { createClient } from '@supabase/supabase-js'

const url = process.env.VITE_SUPABASE_URL ?? 'http://127.0.0.1:54321'
const anon = process.env.VITE_SUPABASE_ANON_KEY

async function makeUser(email: string) {
  const c = createClient(url, anon!)
  await c.auth.signUp({ email, password: 'passw0rd!' })
  const { data } = await c.auth.signInWithPassword({ email, password: 'passw0rd!' })
  return { client: c, userId: data.user!.id }
}

// Requires a running Supabase stack with VITE_SUPABASE_ANON_KEY set. Skips locally
// when that env is absent so `npm run test` stays green; CI runs it with env sourced.
describe.skipIf(!anon)('RLS isolation', () => {
  it('user A cannot read user B rows', async () => {
    const a = await makeUser(`a_${Date.now()}@test.dev`)
    const b = await makeUser(`b_${Date.now()}@test.dev`)

    await a.client.from('sessions').insert({
      user_id: a.userId, client_id: 'c1', discipline: 'strength',
    })

    const { data: bSeesA } = await b.client
      .from('sessions').select('*').eq('user_id', a.userId)
    expect(bSeesA).toEqual([])   // B must see none of A's rows
  })
})
