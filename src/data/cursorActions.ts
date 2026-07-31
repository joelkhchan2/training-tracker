import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { Cursor, Program } from '../domain'
import { advanceCursor } from '../domain'
import { getSupabase } from './supabase'

/** Writes a new cursor to the caller's own `program_state` row (RLS-scoped to auth.uid()).
 *  Shared by skip (advance) and pick (set day). No session, no log — a plain cursor move. */
async function writeCursor(cursor: Cursor): Promise<void> {
  const supabase = getSupabase()
  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError) throw userError
  const userId = userData?.user?.id
  if (!userId) throw new Error('Not authenticated')
  const { error } = await supabase.from('program_state').update({ cursor }).eq('user_id', userId)
  if (error) throw error
}

/** Skip today: advance the cursor exactly as a logged day would (rolls week/cycle at the ends),
 *  without logging anything. Value-based idempotent, like every cursor write. */
export function useAdvanceCursor() {
  const queryClient = useQueryClient()
  return useMutation<void, Error, { program: Program; cursor: Cursor }>({
    mutationFn: async ({ program, cursor }) => {
      const { cursor: next } = advanceCursor(program, cursor)
      await writeCursor(next)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['activeWorkout'] }),
  })
}

/** Pick a different day to do now: move only `dayIndex`, preserving week and cycle (deliberately
 *  never rolls the schedule — that's what skip is for). */
export function useSetCursorDay() {
  const queryClient = useQueryClient()
  return useMutation<void, Error, { cursor: Cursor; dayIndex: number }>({
    mutationFn: async ({ cursor, dayIndex }) => {
      await writeCursor({ dayIndex, week: cursor.week, cycle: cursor.cycle })
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['activeWorkout'] }),
  })
}
