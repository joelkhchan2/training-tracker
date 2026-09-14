import { useMutation, useQueryClient } from '@tanstack/react-query'
import { getSupabase } from './supabase'

export interface TrainingMaxEdit {
  key: string
  /** New training-max value, in lb (canonical). */
  value: number
  /** The value before this edit, stored as `prev_value` for history/display. Null when the
   *  user had no max on file for this key yet. */
  prevValue: number | null
}

export interface UpdateTrainingMaxesInput {
  updates: TrainingMaxEdit[]
}

/**
 * Directly edits the user's training maxes — the weights every percentage-scheme lift (5/3/1
 * etc.) is calculated from. Until now the only thing that changed a training max was the
 * automatic per-cycle bump; there was no way to set one by hand after testing a new max,
 * deloading, or correcting a bad number. This upserts each edited `training_maxes` row as
 * `auth.uid()` (own-row RLS), recording the previous value in `prev_value`, and invalidates the
 * active-workout bundle so the next prescription reflects the new numbers immediately.
 */
export function useUpdateTrainingMaxes() {
  const queryClient = useQueryClient()

  return useMutation<{ userId: string }, Error, UpdateTrainingMaxesInput>({
    mutationFn: async ({ updates }) => {
      const supabase = getSupabase()

      const { data: userData, error: userError } = await supabase.auth.getUser()
      if (userError) throw userError
      const userId = userData?.user?.id
      if (!userId) throw new Error('Not authenticated')

      if (updates.length === 0) return { userId }

      const rows = updates.map((u) => ({
        user_id: userId,
        key: u.key,
        value: u.value,
        prev_value: u.prevValue,
      }))

      const { error } = await supabase.from('training_maxes').upsert(rows, { onConflict: 'user_id,key' })
      if (error) throw error

      return { userId }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activeWorkout'] })
    },
  })
}
