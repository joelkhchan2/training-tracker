import { Card } from '../../components/ui/Card'
import { Textarea } from '../../components/ui/Textarea'
import { useSessionStore } from './sessionStore'

/** Session-level capture: free-text notes + optional body-weight, both persisted in the
 *  session store and saved with the workout. Body-weight uses a nullable numeric input
 *  (blank = not logged) rather than the weight/reps NumberField, whose 0-default would be
 *  indistinguishable from an entered 0. */
export function SessionMetaCard() {
  const notes = useSessionStore((s) => s.notes)
  const bodyWeight = useSessionStore((s) => s.bodyWeight)
  const setNotes = useSessionStore((s) => s.setNotes)
  const setBodyWeight = useSessionStore((s) => s.setBodyWeight)

  return (
    <Card className="space-y-3">
      <Textarea label="Notes" value={notes} onChange={setNotes} rows={2} />
      <div className="flex flex-col gap-2">
        <label htmlFor="session-bodyweight" className="text-sm font-medium text-muted">
          Body weight (optional)
        </label>
        <input
          id="session-bodyweight"
          type="number"
          inputMode="decimal"
          value={bodyWeight ?? ''}
          onChange={(e) => setBodyWeight(e.target.value === '' ? null : Number(e.target.value))}
          className="h-12 w-full rounded-xl border border-border bg-surface px-4 text-base text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        />
      </div>
    </Card>
  )
}
