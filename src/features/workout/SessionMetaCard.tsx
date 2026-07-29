import { Card } from '../../components/ui/Card'
import { Textarea } from '../../components/ui/Textarea'
import { WeightField } from '../../components/ui/WeightField'
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
      <WeightField
        id="session-bodyweight"
        label="Body weight"
        placeholder="optional"
        nullable
        valueLb={bodyWeight}
        onChangeLb={setBodyWeight}
      />
    </Card>
  )
}
