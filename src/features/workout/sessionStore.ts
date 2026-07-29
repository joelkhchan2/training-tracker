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
  /** The original prescribed hold duration for this set (timed prescriptions only),
   *  captured at prescription time and never mutated by editing. When defined, this is
   *  the SOLE discriminator `updateSet`'s carry-forward gate uses for the
   *  `durationSeconds` field — see `updateSet` below — because a timed prescribed set
   *  never populates `prescribedWeight`/`prescribedReps` (both stay undefined), so
   *  those two fields alone can't tell a straight timed prescription apart from an
   *  ascending one. Undefined for a non-timed prescribed set or a set added mid-session
   *  via `addSet`. */
  prescribedDurationSeconds?: number
  /** Optional per-set RPE (6–10, 0.5 steps), null/undefined when not logged. */
  rpe?: number | null
  /** Marks a warmup set: saved with is_warmup=true but excluded from tonnage/PR/progression. */
  isWarmup?: boolean
  /** Duration for a timed/weighted_time exercise's set, in seconds; null when unused
   *  (weighted/bodyweight) or not yet typed in. Like weight/reps' carry-forward, a typed
   *  duration carries forward to later not-yet-done sets only when that later set has no
   *  distinct prescribed target of its own (`prescribedWeight`/`prescribedReps` both
   *  undefined — i.e. a purely ad-hoc set) — see `updateSet` below. */
  durationSeconds: number | null
}

export interface SessionExercise {
  /** Stable client-generated id, assigned at creation and preserved across edits/reorder.
   *  The React list key and @dnd-kit sortable id — never the array index (positions shift)
   *  or exerciseName (duplicates are allowed), and never exerciseId (still null for
   *  prescription-sourced exercises, and even where populated below it's just a read-only
   *  lookup key, not a stable identity to key off of). */
  id: string
  /** Populated only for picker-sourced adhoc exercises (added or swapped in via
   *  ExercisePicker); null for prescription-sourced exercises. Read-only — used for
   *  history/hint lookups, never as identity. The save path resolves exercises by name,
   *  not by this field. */
  exerciseId: string | null
  exerciseName: string
  /** 'strength' | 'bodyweight'. Prescribed exercises default to 'strength'; added/swapped
   *  exercises carry the picked kind. Drives the mint exercise_type for adhoc exercises —
   *  logging-time field rendering is driven by `inputType`, not this. */
  kind: DraftExerciseKind
  tmKey?: string
  /** True for an added or replaced/swapped exercise (no longer the programmed lift). Drives
   *  save-path mint resolution and exclusion from progression. */
  adhoc?: boolean
  /** Which fields this exercise's sets are logged with — always set, never optional.
   *  Defaulted from the catalog exercise_type on add/prescribe (see `defaultInputType`),
   *  overridable mid-session via `setInputType`. Drives SetRow's field rendering and gates
   *  the save path's loggedSets/progressionSets inclusion. */
  inputType: ExerciseInputType
  sets: SessionSet[]
}

/** Logging-only input type — separate from `DraftExerciseKind` (the Custom Program
 *  Builder's 2-option strength/bodyweight kind, which stays weight/reps-only). Not every
 *  exercise is weight×reps: a front lever, dead hang, plank, or weighted hang is logged
 *  by duration, sometimes with added weight, never with reps. */
export type ExerciseInputType = 'weighted' | 'bodyweight' | 'timed' | 'weighted_time'

/** Derives the default input type from a catalog row's raw `exercise_type` plus the
 *  draft `kind` (used when no exercise_type is available, e.g. a typed custom exercise):
 *  a catalog 'timed' exercise always defaults to timed; a catalog 'bodyweight' exercise,
 *  or a bodyweight-kind custom exercise, defaults to bodyweight; everything else
 *  (weighted, unknown/null exercise_type with a strength kind) defaults to weighted.
 *  'weighted_time' has no catalog default — it is reachable only via the ExerciseCard
 *  override control. */
export function defaultInputType(
  exerciseType: string | null | undefined,
  kind: DraftExerciseKind,
): ExerciseInputType {
  if (exerciseType === 'timed') return 'timed'
  if (exerciseType === 'bodyweight' || kind === 'bodyweight') return 'bodyweight'
  return 'weighted'
}

/** Persist schema version. Bumped from the implicit 0 to 1 when `inputType`
 *  (SessionExercise) and `durationSeconds` (SessionSet) became required fields — see
 *  `migrateSession` below. Bump again (and extend `migrateSession`) the next time a
 *  required field is added to the persisted shape. */
export const SESSION_STORE_VERSION = 1

/** Pre-v1 persisted shape: `inputType` didn't exist yet on exercises, and
 *  `durationSeconds` didn't exist yet on sets. Local to the migration — every other
 *  field already matches the current `SessionState`/`SessionExercise`/`SessionSet`
 *  shapes at every historical version. */
type LegacySessionSet = Omit<SessionSet, 'durationSeconds'> & { durationSeconds?: number | null }
type LegacySessionExercise = Omit<SessionExercise, 'inputType' | 'sets'> & {
  inputType?: ExerciseInputType
  sets: LegacySessionSet[]
}
type LegacyPersistedState = Omit<SessionState, 'exercises'> & { exercises: LegacySessionExercise[] }

/** zustand/persist's `migrate` hook, extracted as a pure function so it's unit-testable
 *  without going through localStorage/zustand rehydration. Called once on rehydrate with
 *  whatever was actually in storage (`persisted`, untyped — it predates today's schema)
 *  and the version tag it was written with.
 *
 *  A session persisted before `SESSION_STORE_VERSION` 1 (this feature's deploy) has no
 *  `inputType` on its exercises and no `durationSeconds` on its sets. Left as-is, every
 *  exercise rehydrates with `inputType === undefined`: SetRow's field-visibility flags
 *  all go false, and `shapeSetForSave(undefined, set)` returns `undefined` (pre-default-
 *  arm) or now `null`, which drops the set from the save payload — silently losing the
 *  whole in-progress workout on Finish. Backfilling here, once, on rehydrate, is cheaper
 *  and safer than teaching every downstream consumer to tolerate a missing field. */
export function migrateSession(persisted: unknown, version: number): SessionState {
  if (version >= SESSION_STORE_VERSION) return persisted as SessionState
  const state = persisted as LegacyPersistedState
  if (!state || !Array.isArray(state.exercises)) return persisted as SessionState
  return {
    ...state,
    exercises: state.exercises.map((ex) => ({
      ...ex,
      inputType: ex.inputType ?? defaultInputType(undefined, ex.kind),
      sets: ex.sets.map((s) => ({
        ...s,
        durationSeconds: s.durationSeconds ?? null,
      })),
    })),
  }
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
export type ExercisePick = {
  exerciseName: string
  kind: DraftExerciseKind
  exerciseId?: string
  /** Raw catalog exercise_type, when known — feeds `defaultInputType`. Optional (like
   *  exerciseId): a picker-sourced pick always supplies it (possibly explicit null for
   *  the typed custom-add path); an untouched call site simply omits it, which
   *  `defaultInputType` treats the same as an explicit null. */
  exerciseType?: string | null
}

function emptySet(): SessionSet {
  return { weight: null, reps: null, done: false, durationSeconds: null }
}

/** Builds a fresh adhoc SessionExercise from a picker result — shared by
 *  `addExercise` and `insertExerciseAt` so the two can't drift on shape
 *  (id, adhoc flag, 3 empty sets, no tmKey). Kept module-private: this file
 *  isn't a component, but nothing outside it needs this shape directly. */
function buildAdhocExercise(pick: ExercisePick): SessionExercise {
  return {
    id: crypto.randomUUID(),
    exerciseId: pick.exerciseId ?? null,
    exerciseName: pick.exerciseName,
    kind: pick.kind,
    tmKey: undefined,
    adhoc: true,
    inputType: defaultInputType(pick.exerciseType, pick.kind),
    sets: [emptySet(), emptySet(), emptySet()],
  }
}

export interface SessionActions {
  startFromPrescription: (prescription: PrescribedExercise[], meta: StartSessionMeta) => void
  updateSet: (exIdx: number, setIdx: number, patch: Partial<SessionSet>) => void
  toggleDone: (exIdx: number, setIdx: number) => void
  addSet: (exIdx: number) => void
  removeSet: (exIdx: number, setIdx: number) => void
  addExercise: (pick: ExercisePick) => void
  insertExerciseAt: (index: number, pick: ExercisePick) => void
  removeExercise: (exIdx: number) => void
  replaceExercise: (exIdx: number, pick: ExercisePick) => void
  reorderExercises: (fromIdx: number, toIdx: number) => void
  setNotes: (notes: string) => void
  setBodyWeight: (bodyWeight: number | null) => void
  setInputType: (exIdx: number, inputType: ExerciseInputType) => void
  /** Overwrites `startedAt` with a corrected ISO timestamp (the TimerPopup's Set/±1/Reset
   *  controls). No-op while there's no active session (`startedAt` already null) — there's
   *  nothing to correct and no timer is rendered to have opened this popup in the first place. */
  setStartedAt: (iso: string) => void
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
        const exercises: SessionExercise[] = prescription.map((ex) => {
          // Prescriptions are weight/reps-only UNLESS the scheme is 'timed' (Front
          // Lever Progression, dead hangs, etc.) — derived per-exercise from the
          // prescription's own set shape, mirroring inferInputType's "null-pattern,
          // not a stored tag" philosophy, rather than threading a new type-tag field
          // through PrescribedExercise. An ad-hoc override to any of the 4 types still
          // happens on the card, mid-session.
          const inputType: ExerciseInputType = ex.sets.some(s => s.durationSeconds != null)
            ? 'timed'
            : 'weighted'
          return {
            id: crypto.randomUUID(),
            exerciseId: null,
            exerciseName: ex.exerciseName,
            kind: 'strength',
            tmKey: ex.tmKey,
            inputType,
            sets: ex.sets.map((s, i) => ({
              weight: s.weight ?? null,
              reps: s.reps ?? null,
              done: false,
              isFsl: s.isFsl,
              isAmrap: s.isAmrap,
              targetReps: s.targetReps,
              prescriptionIndex: i,
              prescribedWeight: s.weight,
              prescribedReps: s.reps,
              prescribedDurationSeconds: s.durationSeconds,
              durationSeconds: s.durationSeconds ?? null,
            })),
          }
        })
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
                // Duration carry-forward: prescribedDurationSeconds is the SOLE
                // discriminator when defined — NOT OR'd onto the weight/reps check —
                // because a timed prescribed set never populates prescribedWeight/
                // prescribedReps (both stay undefined), so that check alone is always
                // true for every timed set regardless of its own
                // prescribedDurationSeconds. Replacing (not OR-ing) it here is what
                // lets a straight timed prescription (shared prescribedDurationSeconds,
                // e.g. 4x8s) propagate like any other straight set, while a
                // hypothetical ascending timed scheme (distinct prescribedDurationSeconds
                // per set) correctly does not. For a purely ad-hoc set (no timed
                // prescription at all, prescribedDurationSeconds undefined), this falls
                // back to the same weight/reps-undefined check the pre-existing
                // behavior used, unchanged for that case.
                const durationGateOk = s.prescribedDurationSeconds !== undefined
                  ? s.prescribedDurationSeconds === edited.prescribedDurationSeconds
                  : (s.prescribedWeight === undefined && s.prescribedReps === undefined)
                if ('durationSeconds' in patch && durationGateOk) {
                  next = { ...next, durationSeconds: edited.durationSeconds }
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
              // Not copied from the last set (unlike weight/reps) — a fresh set always
              // starts with no duration typed in, even mid-run of timed holds.
              durationSeconds: null,
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
        set((state) => ({ exercises: [...state.exercises, buildAdhocExercise(pick)] }))
      },

      insertExerciseAt: (index, pick) => {
        set((state) => {
          const clamped = Math.max(0, Math.min(index, state.exercises.length))
          const next = [...state.exercises]
          next.splice(clamped, 0, buildAdhocExercise(pick))
          return { exercises: next }
        })
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
              inputType: defaultInputType(pick.exerciseType, pick.kind),
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
      setInputType: (exIdx, inputType) => {
        set((state) => ({
          exercises: state.exercises.map((ex, i) => (i === exIdx ? { ...ex, inputType } : ex)),
        }))
      },
      setStartedAt: (iso) => {
        set((state) => (state.startedAt === null ? {} : { startedAt: iso }))
      },

      reset: () => set({ ...initialState }),
    }),
    {
      name: 'tt-active-session',
      version: SESSION_STORE_VERSION,
      migrate: (persisted, version) => migrateSession(persisted, version),
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
