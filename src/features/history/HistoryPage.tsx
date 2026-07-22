import { AppShell } from '../../components/ui/AppShell'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { useAuth } from '../../lib/useAuth'
import { useSessionHistory, useDeleteSession } from '../../data/sessionHistory'
import type { CardioHistoryRow, StrengthHistoryRow } from '../../data/sessionHistory'

function CardioRow({ row, onDelete }: { row: CardioHistoryRow; onDelete: () => void }) {
  const detail = [
    row.distanceKm != null ? `${row.distanceKm} km` : null,
    row.durationMinutes != null ? `${row.durationMinutes} min` : null,
    row.pace ? `${row.pace} /km` : null,
  ].filter(Boolean).join(' · ')
  return (
    <Card className="flex items-center justify-between gap-3">
      <div>
        <p className="font-medium text-text">{row.activity}</p>
        <p className="text-sm text-muted">{detail ? `${row.date} · ${detail}` : row.date}</p>
      </div>
      <Button variant="ghost" size="sm" aria-label={`Delete ${row.activity}`} onClick={onDelete}>
        Delete
      </Button>
    </Card>
  )
}

function StrengthRow({ row }: { row: StrengthHistoryRow }) {
  return (
    <Card>
      <p className="font-medium text-text">{row.label}</p>
      <p className="text-sm text-muted">
        {row.date} · {row.setCount} set{row.setCount === 1 ? '' : 's'}
      </p>
    </Card>
  )
}

export function HistoryPage() {
  const { user } = useAuth()
  const { data: rows, isLoading } = useSessionHistory(user?.id)
  const deleteSession = useDeleteSession()

  function handleDelete(id: string, activity: string) {
    if (window.confirm(`Delete this ${activity} entry?`)) deleteSession.mutate(id)
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
          {rows.map(row =>
            row.kind === 'cardio' ? (
              <CardioRow key={row.id} row={row} onDelete={() => handleDelete(row.id, row.activity)} />
            ) : (
              <StrengthRow key={row.id} row={row} />
            ),
          )}
        </div>
      )}
    </AppShell>
  )
}
