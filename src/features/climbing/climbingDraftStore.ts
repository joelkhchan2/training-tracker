import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface GradeEntry {
  attempts: number
  sends: number
}

/** Local-calendar YYYY-MM-DD (not UTC — avoids "tomorrow" flips late at night). Duplicated
 *  from ClimbingLogPage's own helper so the store owns its own default date without importing
 *  the component module. */
function todayLocal(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export interface ClimbingDraftState {
  /** Stable idempotency key for the save RPC — minted once per draft (see `ensureStarted`) and
   *  persisted, so a save retried after an app restart hits the same on-conflict row instead of
   *  minting a duplicate session. Reset to a fresh id when the draft is cleared. */
  clientId: string | null
  /** Per-grade attempts/sends, keyed by V-grade number. */
  entries: Record<number, GradeEntry>
  notes: string
  date: string
  /** Mints `clientId` on first use and returns the id to save under. Idempotent: an already
   *  started draft keeps its id, so calling this on every mount + at save time is safe. */
  ensureStarted: () => string
  patch: (grade: number, field: keyof GradeEntry, value: number) => void
  setNotes: (notes: string) => void
  setDate: (date: string) => void
  /** Clears the draft back to a fresh, empty state with a new idempotency key — called after a
   *  successful save so the next climbing log starts blank rather than resurrecting saved numbers. */
  reset: () => void
}

function freshDraft(): Pick<ClimbingDraftState, 'clientId' | 'entries' | 'notes' | 'date'> {
  return { clientId: null, entries: {}, notes: '', date: todayLocal() }
}

/** Persisted draft for the in-progress climbing log. Mirrors the workout session store's
 *  localStorage persistence so a half-entered climbing session survives closing/backgrounding
 *  the app (and a mid-entry reload) instead of resetting — the same "resume where you left off"
 *  behavior the strength workout screen already has. Cleared on a successful save. */
export const useClimbingDraft = create<ClimbingDraftState>()(
  persist(
    (set, get) => ({
      ...freshDraft(),
      ensureStarted: () => {
        const existing = get().clientId
        if (existing) return existing
        const id = crypto.randomUUID()
        set({ clientId: id })
        return id
      },
      patch: (grade, field, value) => {
        set((state) => {
          const current = state.entries[grade] ?? { attempts: 0, sends: 0 }
          return { entries: { ...state.entries, [grade]: { ...current, [field]: value } } }
        })
      },
      setNotes: (notes) => set({ notes }),
      setDate: (date) => set({ date }),
      reset: () => set({ ...freshDraft() }),
    }),
    {
      name: 'tt-climbing-draft',
      partialize: (state) => ({
        clientId: state.clientId,
        entries: state.entries,
        notes: state.notes,
        date: state.date,
      }),
    },
  ),
)
