import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { PrescribedExercise } from '../../domain/types'

export interface SessionSet {
  weight: number | null
  reps: number | null
  done: boolean
  isFsl?: boolean
  /** Carried through from the prescription so `handleFinish` (Task 4's save flow) can
   *  identify the AMRAP set and its target reps without re-deriving them from `scheme`. */
  isAmrap?: boolean
  targetReps?: number
  /** The set's original index into the exercise's `scheme.sets`, captured at prescription
   *  time. Undefined for sets the user adds mid-session (not part of the prescription).
   *  Used by the save flow to match logged sets to prescribed sets by a stable key rather
   *  than by recomputed array position, which shifts when a set is added/removed. */
  prescriptionIndex?: number
  /** The original prescribed target for this set, captured at prescription time and
   *  never mutated by editing. Used by `updateSet`'s smart carry-forward to decide
   *  whether a later set shares the same target (straight sets) or has its own
   *  distinct target (e.g. an ascending 5/3/1 scheme), independently for weight and
   *  reps. Undefined for sets the user adds mid-session via `addSet`. */
  prescribedWeight?: number
  prescribedReps?: number
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
          sets: ex.sets.map((s, i) => ({
            weight: s.weight ?? null,
            reps: s.reps,
            done: false,
            isFsl: s.isFsl,
            isAmrap: s.isAmrap,
            targetReps: s.targetReps,
            prescriptionIndex: i,
            prescribedWeight: s.weight,
            prescribedReps: s.reps,
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
            const target = ex.sets[setIdx]
            if (!target) return ex
            const edited: SessionSet = { ...target, ...patch }
            return {
              ...ex,
              sets: ex.sets.map((s, j) => {
                if (j === setIdx) return edited
                // Smart carry-forward: only later, not-yet-done sets, and only for
                // fields present in this patch, and only when that field's
                // prescribed target matches the edited set's — this lets straight
                // sets (same target every set) prefill forward while leaving
                // ascending schemes (e.g. 5/3/1's distinct per-set weights) alone.
                if (j <= setIdx || s.done) return s
                let next = s
                if ('weight' in patch && s.prescribedWeight === edited.prescribedWeight) {
                  next = { ...next, weight: edited.weight }
                }
                if ('reps' in patch && s.prescribedReps === edited.prescribedReps) {
                  next = { ...next, reps: edited.reps }
                }
                return next
              }),
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
