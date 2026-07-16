import { Navigate } from 'react-router-dom'
import { AppShell } from '../../components/ui/AppShell'
import { Button } from '../../components/ui/Button'
import { ExerciseCard } from './ExerciseCard'
import { useSessionStore } from './sessionStore'

/** Active-session logging screen: one ExerciseCard per exercise plus a
 *  sticky "Finish workout" action. Redirects Home when there's no active
 *  session (e.g. a deep link to /workout without starting one first). */
export function WorkoutPage() {
  const status = useSessionStore((s) => s.status)
  const dayName = useSessionStore((s) => s.dayName)
  const exercises = useSessionStore((s) => s.exercises)

  if (status !== 'active') {
    return <Navigate to="/" replace />
  }

  return (
    <AppShell title={dayName ?? 'Workout'}>
      <div className="space-y-4 pb-24">
        {exercises.map((exercise, exIdx) => (
          <ExerciseCard key={exIdx} exIdx={exIdx} exercise={exercise} />
        ))}
      </div>

      <div
        className="fixed inset-x-0 bottom-0 border-t border-border bg-bg/95 p-4 backdrop-blur-sm"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1rem)' }}
      >
        <Button
          fullWidth
          onClick={() => {
            // TODO(Task 7): persist the completed session via the save mutation, then reset the store.
          }}
        >
          Finish workout
        </Button>
      </div>
    </AppShell>
  )
}
