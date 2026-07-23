import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { PrescribedExercise } from '../../domain/types'
import type { DraftExerciseKind } from '../../domain/programDraft'

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
  /** Optional per-set RPE (6–10, 0.5 steps), null/undefined when not logged. */
  rpe?: number | null
  /** Marks a warmup set: saved with is_warmup=true but excluded from tonnage/PR/progression. */
  isWarmup?: boolean
}

export interface SessionExercise {
  /** Stable client-generated id, assigned at creation and preserved across edits/reorder.
   *  The React list key and @dnd-kit sortable id — never the array index (positions shift)
   *  and never exerciseName (duplicates are allowed) or exerciseId (null in-session). */
  id: string
  exerciseId: string | null
  exerciseName: string
  /** 'strength' | 'bodyweight'. Prescribed exercises default to 'strength'; added/swapped
   *  exercises carry the picked kind. Drives the mint exercise_type and hiding the weight
   *  field for bodyweight. */
  kind: DraftExerciseKind
  tmKey?: string
  /** True for an added or replaced/swapped exercise (no longer the programmed lift). Drives
   *  save-path mint resolution and exclusion from progression. */
  adhoc?: boolean
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
  notes: string
  bodyWeight: number | null
}

export interface StartSessionMeta {
  sessionType: string
  dayName: string
  dayIndex: number
  clientId: string
  startedAt: string
}

/** Structurally the `PickedExercise` type from ExercisePicker; kept local so the store
 *  doesn't import a component module. */
export type ExercisePick = { exerciseName: string; kind: DraftExerciseKind; exerciseId?: string }

function emptySet(): SessionSet {
  return { weight: null, reps: null, done: false }
}

export interface SessionActions {
  startFromPrescription: (prescription: PrescribedExercise[], meta: StartSessionMeta) => void
  updateSet: (exIdx: number, setIdx: number, patch: Partial<SessionSet>) => void
  toggleDone: (exIdx: number, setIdx: number) => void
  addSet: (exIdx: number) => void
  removeSet: (exIdx: number, setIdx: number) => void
  addExercise: (pick: ExercisePick) => void
  removeExercise: (exIdx: number) => void
  replaceExercise: (exIdx: number, pick: ExercisePick) => void
  reorderExercises: (fromIdx: number, toIdx: number) => void
  setNotes: (notes: string) => void
  setBodyWeight: (bodyWeight: number | null) => void
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
  notes: '',
  bodyWeight: null,
}

export const useSessionStore = create<SessionState & SessionActions>()(
  persist(
    (set) => ({
      ...initialState,

      startFromPrescription: (prescription, meta) => {
        const exercises: SessionExercise[] = prescription.map((ex) => ({
          id: crypto.randomUUID(),
          exerciseId: null,
          exerciseName: ex.exerciseName,
          kind: 'strength',
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
          notes: '',
          bodyWeight: null,
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

      addExercise: (pick) => {
        set((state) => ({
          exercises: [
            ...state.exercises,
            {
              id: crypto.randomUUID(),
              exerciseId: pick.exerciseId ?? null,
              exerciseName: pick.exerciseName,
              kind: pick.kind,
              tmKey: undefined,
              adhoc: true,
              sets: [emptySet(), emptySet(), emptySet()],
            },
          ],
        }))
      },

      removeExercise: (exIdx) => {
        set((state) => ({ exercises: state.exercises.filter((_, i) => i !== exIdx) }))
      },

      replaceExercise: (exIdx, pick) => {
        set((state) => ({
          exercises: state.exercises.map((ex, i) => {
            if (i !== exIdx) return ex
            return {
              id: ex.id,
              exerciseId: pick.exerciseId ?? null,
              exerciseName: pick.exerciseName,
              kind: pick.kind,
              tmKey: undefined,
              adhoc: true,
              // Keep the set count, drop every value + prescription field by
              // building fresh empty sets.
              sets: ex.sets.map(() => emptySet()),
            }
          }),
        }))
      },

      reorderExercises: (fromIdx, toIdx) => {
        set((state) => {
          const n = state.exercises.length
          if (fromIdx === toIdx || fromIdx < 0 || toIdx < 0 || fromIdx >= n || toIdx >= n) return {}
          const next = [...state.exercises]
          const [moved] = next.splice(fromIdx, 1)
          next.splice(toIdx, 0, moved)
          return { exercises: next }
        })
      },

      setNotes: (notes) => set({ notes }),
      setBodyWeight: (bodyWeight) => set({ bodyWeight }),

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
        notes: state.notes,
        bodyWeight: state.bodyWeight,
      }),
    },
  ),
)
