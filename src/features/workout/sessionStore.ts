import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { PrescribedExercise } from '../../domain/types'

export interface SessionSet {
  weight: number | null
  reps: number | null
  done: boolean
  isFsl?: boolean
}

export interface SessionExercise {
  exerciseId: string | null
  exerciseName: string
  tmKey?: string
  sets: SessionSet[]
}

export type SessionStatus = 'idle' | 'active'

export interface SessionState {
  status: SessionStatus
  clientId: string | null
  sessionType: string | null
  dayName: string | null
  dayIndex: number | null
  startedAt: string | null
  exercises: SessionExercise[]
}

export interface StartSessionMeta {
  sessionType: string
  dayName: string
  dayIndex: number
  clientId: string
  startedAt: string
}

export interface SessionActions {
  startFromPrescription: (prescription: PrescribedExercise[], meta: StartSessionMeta) => void
  updateSet: (exIdx: number, setIdx: number, patch: Partial<SessionSet>) => void
  toggleDone: (exIdx: number, setIdx: number) => void
  addSet: (exIdx: number) => void
  removeSet: (exIdx: number, setIdx: number) => void
  reset: () => void
}

const initialState: SessionState = {
  status: 'idle',
  clientId: null,
  sessionType: null,
  dayName: null,
  dayIndex: null,
  startedAt: null,
  exercises: [],
}

export const useSessionStore = create<SessionState & SessionActions>()(
  persist(
    (set) => ({
      ...initialState,

      startFromPrescription: (prescription, meta) => {
        const exercises: SessionExercise[] = prescription.map((ex) => ({
          exerciseId: null,
          exerciseName: ex.exerciseName,
          tmKey: ex.tmKey,
          sets: ex.sets.map((s) => ({
            weight: s.weight ?? null,
            reps: s.reps,
            done: false,
            isFsl: s.isFsl,
          })),
        }))
        set({
          status: 'active',
          clientId: meta.clientId,
          sessionType: meta.sessionType,
          dayName: meta.dayName,
          dayIndex: meta.dayIndex,
          startedAt: meta.startedAt,
          exercises,
        })
      },

      updateSet: (exIdx, setIdx, patch) => {
        set((state) => ({
          exercises: state.exercises.map((ex, i) => {
            if (i !== exIdx) return ex
            return {
              ...ex,
              sets: ex.sets.map((s, j) => (j === setIdx ? { ...s, ...patch } : s)),
            }
          }),
        }))
      },

      toggleDone: (exIdx, setIdx) => {
        set((state) => ({
          exercises: state.exercises.map((ex, i) => {
            if (i !== exIdx) return ex
            return {
              ...ex,
              sets: ex.sets.map((s, j) => (j === setIdx ? { ...s, done: !s.done } : s)),
            }
          }),
        }))
      },

      addSet: (exIdx) => {
        set((state) => ({
          exercises: state.exercises.map((ex, i) => {
            if (i !== exIdx) return ex
            const last = ex.sets[ex.sets.length - 1]
            const newSet: SessionSet = {
              weight: last?.weight ?? null,
              reps: last?.reps ?? null,
              done: false,
            }
            return { ...ex, sets: [...ex.sets, newSet] }
          }),
        }))
      },

      removeSet: (exIdx, setIdx) => {
        set((state) => ({
          exercises: state.exercises.map((ex, i) => {
            if (i !== exIdx) return ex
            return { ...ex, sets: ex.sets.filter((_, j) => j !== setIdx) }
          }),
        }))
      },

      reset: () => set({ ...initialState }),
    }),
    {
      name: 'tt-active-session',
      partialize: (state) => ({
        status: state.status,
        clientId: state.clientId,
        sessionType: state.sessionType,
        dayName: state.dayName,
        dayIndex: state.dayIndex,
        startedAt: state.startedAt,
        exercises: state.exercises,
      }),
    },
  ),
)
