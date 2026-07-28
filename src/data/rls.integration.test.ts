/// <reference types="node" />
import { describe, it, expect } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = process.env.VITE_SUPABASE_URL ?? 'http://127.0.0.1:54321'
const anon = process.env.VITE_SUPABASE_ANON_KEY

// jsdom's localStorage is shared across every createClient() call in this
// test file (one "browser context"), so distinct GoTrueClient instances
// must use distinct storageKeys or their sessions clobber each other via
// the cross-tab storage-sync listener.
async function makeUser(email: string) {
  const c = createClient(url, anon!, { auth: { storageKey: `sb-test-${email}` } })
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

// Each test user needs a real exercise_id to favorite. Insert a custom exercise owned
// by that user (satisfies the "exercises - insert own" RLS policy) rather than depending
// on any seeded/global catalog row — mirrors logWorkout.integration.test.ts's makeExercise.
async function makeExercise(client: SupabaseClient, userId: string) {
  const { data, error } = await client
    .from('exercises')
    .insert({ user_id: userId, name: `Test Exercise ${userId.slice(0, 8)}` })
    .select('id')
    .single()
  if (error) throw error
  return data.id as string
}

describe.skipIf(!anon)('RLS isolation: favorite_exercises', () => {
  it('user A cannot read or delete user B favorite rows and cannot insert as user B; own-row insert/select/delete succeed', async () => {
    const a = await makeUser(`fava_${Date.now()}@test.dev`)
    const b = await makeUser(`favb_${Date.now()}@test.dev`)
    const exerciseId = await makeExercise(a.client, a.userId)

    // Own-row insert succeeds
    const { error: insertError } = await a.client
      .from('favorite_exercises')
      .insert({ user_id: a.userId, exercise_id: exerciseId })
    expect(insertError).toBeNull()

    // B cannot see A's favorite row
    const { data: bSeesA } = await b.client
      .from('favorite_exercises').select('*').eq('user_id', a.userId)
    expect(bSeesA).toEqual([])

    // B cannot insert a favorite row impersonating A (RLS with check blocks the mismatch)
    const { error: bInsertAsA } = await b.client
      .from('favorite_exercises')
      .insert({ user_id: a.userId, exercise_id: exerciseId })
    expect(bInsertAsA).not.toBeNull()

    // B's delete of A's row matches zero rows under B's own-row policy — A still sees it
    await b.client.from('favorite_exercises').delete().eq('user_id', a.userId).eq('exercise_id', exerciseId)
    const { data: aStillSees } = await a.client
      .from('favorite_exercises').select('*').eq('user_id', a.userId)
    expect(aStillSees).toHaveLength(1)

    // A can delete her own row
    const { error: deleteError } = await a.client
      .from('favorite_exercises').delete().eq('user_id', a.userId).eq('exercise_id', exerciseId)
    expect(deleteError).toBeNull()
    const { data: aSeesNone } = await a.client
      .from('favorite_exercises').select('*').eq('user_id', a.userId)
    expect(aSeesNone).toEqual([])
  })
})
