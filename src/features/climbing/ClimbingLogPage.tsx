import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { AppShell } from '../../components/ui/AppShell'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { NumberField } from '../../components/ui/NumberField'
import { Textarea } from '../../components/ui/Textarea'
import { formatVGrade } from '../../domain'
import { useAuth } from '../../lib/useAuth'
import { useProfile } from '../../data/profile'
import { useLogClimbing } from '../../data/logClimbing'

const GRADES = [0, 1, 2, 3, 4, 5, 6, 7, 8]

/** Local-calendar YYYY-MM-DD (not UTC — avoids "tomorrow" flips late at night). */
function todayLocal(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function ClimbingLogPage() {
  const nav = useNavigate()
  const { user } = useAuth()
  const { data: profile, isLoading: profileLoading } = useProfile(user?.id)
  const logClimbing = useLogClimbing()
  // Stable across retries so the RPC's on-conflict idempotency engages on a failed-then-retried
  // save instead of minting a duplicate session (matches CardioLogPage).
  const [clientId] = useState(() => crypto.randomUUID())
  const [counts, setCounts] = useState<Record<number, number>>({})
  const [notes, setNotes] = useState('')
  const [date, setDate] = useState(todayLocal())
  const [error, setError] = useState<string | null>(null)
  const [pr, setPr] = useState<{ newMax: number; prevMax: number | null } | null>(null)

  const climbingEnabled = (profile?.enabled_disciplines ?? []).includes('climbing')
  if (!profileLoading && profile && !climbingEnabled) return <Navigate to="/" replace />

  const totalSends = GRADES.reduce((sum, g) => sum + (counts[g] ?? 0), 0)
  const valid = totalSends > 0

  function setCount(grade: number, value: number) {
    setCounts(prev => ({ ...prev, [grade]: value }))
  }

  function handleSave() {
    if (!valid) {
      setError('Log at least one send before saving.')
      return
    }
    setError(null)
    const sends = GRADES.filter(g => (counts[g] ?? 0) > 0).map(g => ({ grade: formatVGrade(g), count: counts[g] }))
    logClimbing.mutate(
      { clientId, date, notes: notes.trim() || null, sends },
      {
        onSuccess: (res) => {
          if (res.newMaxGrade != null) setPr({ newMax: res.newMaxGrade, prevMax: res.previousMaxGrade })
          else nav('/history')
        },
        onError: () => setError('Could not save. Please try again.'),
      },
    )
  }

  if (pr) {
    return (
      <AppShell title="New personal record">
        <Card className="space-y-3 text-center">
          <p className="text-4xl">🎉</p>
          <p className="text-lg font-semibold text-text">New max grade — V{pr.newMax}!</p>
          {pr.prevMax != null ? <p className="text-sm text-muted">Up from V{pr.prevMax}.</p> : null}
        </Card>
        <Button fullWidth onClick={() => nav('/history')}>Continue</Button>
      </AppShell>
    )
  }

  return (
    <AppShell title="Log climbing">
      <div className="space-y-4">
        <Card className="space-y-3">
          <p className="text-sm text-muted">Sends per grade</p>
          {GRADES.map(g => (
            <NumberField
              key={g}
              label={formatVGrade(g)}
              value={counts[g] ?? 0}
              onChange={v => setCount(g, v)}
              min={0}
              step={1}
            />
          ))}
        </Card>
        <Card className="space-y-4">
          <div className="flex flex-col gap-2">
            <label htmlFor="climb-date" className="text-sm font-medium text-muted">Date</label>
            <input
              id="climb-date"
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="h-12 w-full rounded-xl border border-border bg-surface px-4 text-base text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            />
          </div>
          <Textarea label="Notes (optional)" value={notes} onChange={setNotes} rows={3} />
        </Card>
        {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
        <Button fullWidth onClick={handleSave} disabled={!valid || logClimbing.isPending}>
          {logClimbing.isPending ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </AppShell>
  )
}
