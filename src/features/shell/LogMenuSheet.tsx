import { useLogMenuOptions } from './logMenu'
import type { Discipline } from '../../domain'

export interface LogMenuSheetProps {
  open: boolean
  onClose: () => void
  /** Discipline(s) already reachable another way on the current screen — omitted from the
   *  list (e.g. the one already being logged here, or one with its own inline "+ Add
   *  exercise" affordance on this page already). */
  exclude?: Discipline | Discipline[]
}

/** Bottom sheet of "+ Log" options (Strength/Cardio/Climbing), gated by enabled disciplines.
 *  Shared between the Home-screen FAB (AppLayout) and the in-session header button on the
 *  full-screen Workout/Climbing/Cardio pages, so starting a second discipline mid-session
 *  (e.g. logging a lift while a climbing session is in progress) works the same everywhere —
 *  each discipline's draft is a separate store, so switching screens never loses the other
 *  one's in-progress entries. */
export function LogMenuSheet({ open, onClose, exclude }: LogMenuSheetProps) {
  const options = useLogMenuOptions(exclude)
  if (!open) return null
  return (
    <div className="fixed inset-0 z-40 flex items-end bg-black/40" onClick={onClose}>
      <div className="mx-auto w-full max-w-md space-y-2 rounded-t-2xl bg-surface p-4" onClick={(e) => e.stopPropagation()}>
        {options.map((opt) => (
          <button
            key={opt.discipline}
            type="button"
            className="w-full rounded-xl border border-border bg-bg py-3 text-text"
            onClick={() => {
              onClose()
              opt.onSelect()
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  )
}
