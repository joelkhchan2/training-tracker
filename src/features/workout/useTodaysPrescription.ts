import { useMemo } from 'react'
import { useAuth } from '../../lib/useAuth'
import { useActiveWorkout } from '../../data/queries'
import { getPrescription } from '../../domain/programEngine'
import type { PrescribedExercise } from '../../domain/types'

export interface TodaysPrescription {
  loading: boolean
  hasProgram: boolean
  dayName: string
  dayIndex: number
  label: string
  prescription: PrescribedExercise[]
}

const EMPTY: Omit<TodaysPrescription, 'loading'> = {
  hasProgram: false,
  dayName: '',
  dayIndex: 0,
  label: '',
  prescription: [],
}

/** Composes the active-program bundle with the domain engine to produce
 *  "what should the user do today": a human-readable label (cycle/week/day),
 *  the day name/index (needed to start a session), and the resolved
 *  prescribed exercises for the current cursor position. */
export function useTodaysPrescription(): TodaysPrescription {
  const { user } = useAuth()
  const { data: bundle, isLoading } = useActiveWorkout(user?.id)

  return useMemo(() => {
    if (isLoading) return { loading: true, ...EMPTY }
    if (!bundle) return { loading: false, ...EMPTY }

    const { program, cursor, trainingMaxes } = bundle
    const day = program.days[cursor.dayIndex]
    const dayName = day?.name ?? ''
    const label = `Cycle ${cursor.cycle} · Week ${cursor.week} · ${dayName}`
    const prescription = getPrescription(program, cursor, trainingMaxes)

    return {
      loading: false,
      hasProgram: true,
      dayName,
      dayIndex: cursor.dayIndex,
      label,
      prescription,
    }
  }, [bundle, isLoading])
}
