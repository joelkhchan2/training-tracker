import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { AppShell } from '../../components/ui/AppShell'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { NumberField } from '../../components/ui/NumberField'
import { Textarea } from '../../components/ui/Textarea'
import { formatVGrade, normalizeClimbingEntries } from '../../domain'
import type { Cursor } from '../../domain'
import { useAuth } from '../../lib/useAuth'
import { useProfile } from '../../data/profile'
import { useActiveWorkout } from '../../data/queries'
import { buildSavePlan } from '../../data/mutations'
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

interface GradeEntry {
  attempts: number
  sends: number
}

export function ClimbingLogPage() {
  const nav = useNavigate()
  const location = useLocation()
  const programLinked = Boolean((location.state as { programLinked?: boolean } | null)?.programLinked)
  const { user } = useAuth()
  const { data: profile, isLoading: profileLoading } = useProfile(user?.id)
  // Only program-linked mode consults the active bundle (for the guard + advance plan). Ad-hoc
  // never reads it. The query stays disabled until user.id is known.
  const { data: bundle } = useActiveWorkout(user?.id)
  const logClimbing = useLogClimbing()
  // Stable across retries so the RPC's on-conflict idempotency engages on a failed-then-retried
  // save instead of minting a duplicate session (matches CardioLogPage).
  const [clientId] = useState(() => crypto.randomUUID())
  const [entries, setEntries] = useState<Record<number, GradeEntry>>({})
  const [notes, setNotes] = useState('')
  const [date, setDate] = useState(todayLocal())
  const [error, setError] = useState<string | null>(null)
  const [pr, setPr] = useState<{ newMax: number; prevMax: number | null } | null>(null)

  const climbingEnabled = (profile?.enabled_disciplines ?? []).includes('climbing')
  // A program-linked launch is authorized by the program itself, so skip the enabled-disciplines redirect.
  if (!programLinked && !profileLoading && profile && !climbingEnabled) return <Navigate to="/" replace />

  // In program-linked mode Save waits for the bundle to resolve (there must be a cursor to snapshot).
  const bundleResolving = programLinked && !bundle

  const payload = normalizeClimbingEntries(
    GRADES.map((g) => ({
      grade: formatVGrade(g),
      attempts: entries[g]?.attempts ?? 0,
      sends: entries[g]?.sends ?? 0,
    })),
  )
  const valid = payload.length > 0

  function patch(grade: number, field: keyof GradeEntry, value: number) {
    setEntries((prev) => {
      const current = prev[grade] ?? { attempts: 0, sends: 0 }
      return { ...prev, [grade]: { ...current, [field]: value } }
    })
  }

  // Where a successful save lands: Home in program-linked mode (so the advanced cursor shows), History otherwise.
  const successDest = programLinked ? '/' : '/history'

  function handleSave() {
    if (!valid) {
      setError('Log at least one attempt or send before saving.')
      return
    }
    setError(null)

    // ONE snapshot at Save-press drives both the guard and the plan (they can never disagree).
    let advance: { nextCursor: Cursor; lastAdvanceKey: string } | undefined
    if (programLinked && bundle) {
      const { program, cursor } = bundle
      const dayDiscipline = program.days[cursor.dayIndex]?.discipline ?? 'strength'
      if (dayDiscipline === 'climbing') {
        const plan = buildSavePlan(program, cursor)
        advance = { nextCursor: plan.nextCursor, lastAdvanceKey: plan.lastAdvanceKey }
      }
      // else: cursor drifted onto a non-climbing day -> fall back to ad-hoc (log, no advance).
    }

    logClimbing.mutate(
      { clientId, date, notes: notes.trim() || null, sends: payload, nextCursor: advance?.nextCursor, lastAdvanceKey: advance?.lastAdvanceKey },
      {
        onSuccess: (res) => {
          if (res.newMaxGrade != null) setPr({ newMax: res.newMaxGrade, prevMax: res.previousMaxGrade })
          else nav(successDest)
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
        <Button fullWidth onClick={() => nav(successDest)}>Continue</Button>
      </AppShell>
    )
  }

  return (
    <AppShell title="Log climbing">
      <div className="space-y-4">
        <Card className="space-y-4">
          <p className="text-sm text-muted">Attempts &amp; sends per grade</p>
          {GRADES.map((g) => (
            <div key={g} className="space-y-3">
              <span className="text-lg font-semibold text-text">{formatVGrade(g)}</span>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <NumberField
                  label={`${formatVGrade(g)} attempts`}
                  value={entries[g]?.attempts ?? 0}
                  onChange={(v) => patch(g, 'attempts', v)}
                  min={0}
                />
                <NumberField
                  label={`${formatVGrade(g)} sends`}
                  value={entries[g]?.sends ?? 0}
                  onChange={(v) => patch(g, 'sends', v)}
                  min={0}
                />
              </div>
            </div>
          ))}
        </Card>
        <Card className="space-y-4">
          <div className="flex flex-col gap-2">
            <label htmlFor="climb-date" className="text-sm font-medium text-muted">Date</label>
            <input
              id="climb-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="h-12 w-full rounded-xl border border-border bg-surface px-4 text-base text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            />
          </div>
          <Textarea label="Notes (optional)" value={notes} onChange={setNotes} rows={3} />
        </Card>
        {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
        <Button fullWidth onClick={handleSave} disabled={!valid || logClimbing.isPending || bundleResolving}>
          {logClimbing.isPending ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </AppShell>
  )
}
