import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppShell } from '../../components/ui/AppShell'
import { Card } from '../../components/ui/Card'
import { useAuth } from '../../lib/useAuth'
import { usePersonalRecords, filterSortRecords } from '../../data/personalRecords'
import type { StrengthRecord } from '../../data/personalRecords'

function RecordCard({ r }: { r: StrengthRecord }) {
  const e1rm = r.bestE1rm > 0
    ? `e1RM ${r.bestE1rm}${r.bestE1rmWeight != null && r.bestE1rmReps != null ? ` · ${r.bestE1rmWeight}×${r.bestE1rmReps}` : ''}`
    : null
  const vol = r.bestVolume > 0 ? `vol ${r.bestVolume}` : null
  const detail = [e1rm, vol].filter(Boolean).join('  ·  ')
  return (
    <Card>
      <p className="font-medium text-text">{r.exerciseName}</p>
      {detail ? <p className="text-sm text-muted">{detail}</p> : null}
    </Card>
  )
}

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function ProgressPage() {
  const { user } = useAuth()
  const nav = useNavigate()
  const { data, isLoading, isError } = usePersonalRecords(user?.id)

  const [query, setQuery] = useState('')
  const [pattern, setPattern] = useState('all')
  const [sort, setSort] = useState<'e1rm' | 'volume' | 'name'>('e1rm')

  const strength = useMemo(() => data?.strength ?? [], [data])
  const climbing = data?.climbingMaxGrade ?? null
  const empty = strength.length === 0 && climbing == null

  const patternOptions = useMemo(() => {
    const distinct = new Set<string>()
    let hasNull = false
    for (const r of strength) {
      if (r.movementPattern == null) hasNull = true
      else distinct.add(r.movementPattern)
    }
    const opts = ['all', ...Array.from(distinct).sort(), ...(hasNull ? ['other'] : [])]
    return opts
  }, [strength])

  const visible = useMemo(
    () => filterSortRecords(strength, { query, pattern, sort }),
    [strength, query, pattern, sort],
  )

  const filterActive = query !== '' || pattern !== 'all'
  const showClimbing = climbing != null && pattern === 'all' && query === ''

  return (
    <AppShell title="Progress">
      <div className="space-y-6">
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-text">Tools</h2>
          <button type="button" onClick={() => nav('/progress/calculator')} className="block w-full text-left">
            <Card>
              <p className="font-medium text-text">1RM Calculator</p>
              <p className="text-sm text-muted">Estimate your one-rep max and training loads</p>
            </Card>
          </button>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-text">Personal records</h2>
          {isLoading ? (
            <p className="text-muted">Loading…</p>
          ) : isError ? (
            <p role="alert" className="text-sm text-danger">Could not load your records. Please try again.</p>
          ) : empty ? (
            <Card><p className="text-muted">Log some workouts to see your records here.</p></Card>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                <input
                  type="search"
                  aria-label="Search records"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Search records"
                  className="min-h-[44px] flex-1 rounded-xl border border-border bg-transparent px-3 py-2 text-sm text-text"
                />
                <select
                  aria-label="Filter by movement"
                  value={pattern}
                  onChange={e => setPattern(e.target.value)}
                  className="min-h-[44px] rounded-xl border border-border bg-transparent px-3 py-2 text-sm text-text"
                >
                  {patternOptions.map(p => (
                    <option key={p} value={p}>{titleCase(p)}</option>
                  ))}
                </select>
                <select
                  aria-label="Sort records"
                  value={sort}
                  onChange={e => setSort(e.target.value as 'e1rm' | 'volume' | 'name')}
                  className="min-h-[44px] rounded-xl border border-border bg-transparent px-3 py-2 text-sm text-text"
                >
                  <option value="e1rm">e1RM ↓</option>
                  <option value="volume">Volume ↓</option>
                  <option value="name">Name A–Z</option>
                </select>
              </div>

              {visible.length === 0 && filterActive ? (
                <Card><p className="text-muted">No matching records.</p></Card>
              ) : (
                visible.map(r => <RecordCard key={r.exerciseId} r={r} />)
              )}
              {showClimbing ? (
                <Card>
                  <p className="font-medium text-text">Climbing</p>
                  <p className="text-sm text-muted">max V{climbing}</p>
                </Card>
              ) : null}
            </>
          )}
        </section>
      </div>
    </AppShell>
  )
}
