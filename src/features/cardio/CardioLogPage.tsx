import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { AppShell } from '../../components/ui/AppShell'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Select } from '../../components/ui/Select'
import { NumberField } from '../../components/ui/NumberField'
import { TextField } from '../../components/ui/TextField'
import { Textarea } from '../../components/ui/Textarea'
import { formatPace } from '../../domain'
import { useAuth } from '../../lib/useAuth'
import { useProfile } from '../../data/profile'
import { useLogCardio } from '../../data/logCardio'

const ACTIVITIES = ['Run', 'Bike', 'Row', 'Swim', 'Walk', 'Elliptical', 'Hike', 'Other']

/** Local-calendar YYYY-MM-DD (not UTC — avoids "tomorrow" flips late at night). */
function todayLocal(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function CardioLogPage() {
  const nav = useNavigate()
  const { user } = useAuth()
  const { data: profile, isLoading: profileLoading } = useProfile(user?.id)
  const logCardio = useLogCardio()
  // Stable across retries so the log_cardio RPC's on-conflict idempotency engages on a
  // failed-then-retried save instead of minting a duplicate session. Regenerating per Save
  // press would defeat it. On success we navigate away (unmount), so no reset is needed.
  const [clientId] = useState(() => crypto.randomUUID())
  const [activityChoice, setActivityChoice] = useState('Run')
  const [customActivity, setCustomActivity] = useState('')
  const [duration, setDuration] = useState(30)
  const [distance, setDistance] = useState(0)
  const [notes, setNotes] = useState('')
  const [date, setDate] = useState(todayLocal())
  const [error, setError] = useState<string | null>(null)

  // Route-level gate (spec): a user with cardio disabled who reaches /cardio/new directly (stale
  // link, typed URL, back button after disabling) is redirected home, in addition to the chooser
  // gate in AppLayout. Placed AFTER all hooks so hook order is stable. `profile` is undefined
  // while loading, so the form shows briefly then redirects once the disabled profile arrives.
  const cardioEnabled = (profile?.enabled_disciplines ?? []).includes('cardio')
  if (!profileLoading && profile && !cardioEnabled) return <Navigate to="/" replace />

  const activity = activityChoice === 'Other' ? customActivity.trim() : activityChoice
  const distanceKm = distance > 0 ? distance : null
  const pace = formatPace(duration, distanceKm)
  const valid = activity.length > 0 && duration > 0

  function handleSave() {
    if (!valid) {
      setError('Enter an activity and a duration greater than zero.')
      return
    }
    setError(null)
    logCardio.mutate(
      {
        clientId,
        date,
        activity,
        durationMinutes: duration,
        distanceKm,
        notes: notes.trim() || null,
      },
      {
        onSuccess: () => nav('/history'),
        onError: () => setError('Could not save. Please try again.'),
      },
    )
  }

  return (
    <AppShell title="Log cardio">
      <div className="space-y-4">
        <Card className="space-y-4">
          <Select
            label="Activity"
            value={activityChoice}
            onChange={setActivityChoice}
            options={ACTIVITIES.map(a => ({ value: a, label: a }))}
          />
          {activityChoice === 'Other' ? (
            <TextField label="Activity name" value={customActivity} onChange={setCustomActivity} placeholder="e.g. Kayak" />
          ) : null}
          <NumberField label="Duration (min)" value={duration} onChange={setDuration} min={0} step={1} />
          <NumberField label="Distance (km, optional)" value={distance} onChange={setDistance} min={0} step={0.1} />
          <div className="flex flex-col gap-2">
            <label htmlFor="cardio-date" className="text-sm font-medium text-muted">Date</label>
            <input
              id="cardio-date"
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="h-12 w-full rounded-xl border border-border bg-surface px-4 text-base text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            />
          </div>
          <Textarea label="Notes (optional)" value={notes} onChange={setNotes} rows={3} />
          {valid && pace ? <p className="text-sm text-muted">Pace: {pace} /km</p> : null}
        </Card>
        {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
        <Button fullWidth onClick={handleSave} disabled={logCardio.isPending}>
          {logCardio.isPending ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </AppShell>
  )
}
