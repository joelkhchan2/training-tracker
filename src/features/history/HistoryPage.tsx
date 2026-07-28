import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppShell } from '../../components/ui/AppShell'
import { Card } from '../../components/ui/Card'
import { useAuth } from '../../lib/useAuth'
import { useSessionHistory } from '../../data/sessionHistory'
import type { CardioHistoryRow, StrengthHistoryRow, ClimbingHistoryRow } from '../../data/sessionHistory'

const SCROLL_KEY = 'historyScroll'

function CardioRow({ row }: { row: CardioHistoryRow }) {
  const detail = [
    row.distanceKm != null ? `${Number(row.distanceKm.toFixed(2))} km` : null,
    row.durationMinutes != null ? `${row.durationMinutes} min` : null,
    row.pace ? `${row.pace} /km` : null,
  ].filter(Boolean).join(' · ')
  return (
    <>
      <p className="font-medium text-text">{row.activity}</p>
      <p className="text-sm text-muted">{detail ? `${row.date} · ${detail}` : row.date}</p>
    </>
  )
}

function StrengthRow({ row }: { row: StrengthHistoryRow }) {
  return (
    <>
      <p className="font-medium text-text">{row.label}</p>
      <p className="text-sm text-muted">{row.date} · {row.setCount} set{row.setCount === 1 ? '' : 's'}</p>
    </>
  )
}

function ClimbingRow({ row }: { row: ClimbingHistoryRow }) {
  const summary = row.totalSends === 0
    ? `${row.totalAttempts} attempt${row.totalAttempts === 1 ? '' : 's'} · 0 sends`
    : [
        `${row.totalSends} send${row.totalSends === 1 ? '' : 's'}`,
        row.totalAttempts > row.totalSends ? `${row.totalAttempts} tried` : null,
      ].filter(Boolean).join(' · ')
  const detail = [row.breakdown || null, summary].filter(Boolean).join(' · ')
  return (
    <>
      <p className="font-medium text-text">Climbing</p>
      <p className="text-sm text-muted">{row.date} · {detail}</p>
    </>
  )
}

export function HistoryPage() {
  const { user } = useAuth()
  const { data: rows, isLoading } = useSessionHistory(user?.id)
  const nav = useNavigate()

  // Restore the scroll offset saved when the user last opened a detail, once the list is present.
  useEffect(() => {
    if (isLoading) return
    const saved = sessionStorage.getItem(SCROLL_KEY)
    if (saved) {
      window.scrollTo(0, Number(saved))
      sessionStorage.removeItem(SCROLL_KEY)
    }
  }, [isLoading])

  function open(id: string) {
    sessionStorage.setItem(SCROLL_KEY, String(window.scrollY))
    nav(`/history/${id}`)
  }

  return (
    <AppShell title="History">
      {isLoading ? (
        <p className="text-muted">Loading…</p>
      ) : !rows || rows.length === 0 ? (
        <Card>
          <p className="text-muted">No sessions yet. Log a workout or cardio to see it here.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {rows.map(row => (
            <button key={row.id} type="button" onClick={() => open(row.id)} className="block w-full text-left">
              <Card>
                {row.kind === 'cardio' ? <CardioRow row={row} />
                  : row.kind === 'climbing' ? <ClimbingRow row={row} />
                  : <StrengthRow row={row} />}
              </Card>
            </button>
          ))}
        </div>
      )}
    </AppShell>
  )
}
