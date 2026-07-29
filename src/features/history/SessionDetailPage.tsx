import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AppShell } from '../../components/ui/AppShell'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { useDeleteSession } from '../../data/sessionHistory'
import { useSessionDetail, formatSet } from '../../data/sessionDetail'
import type { SessionDetail, SessionHeader } from '../../data/sessionDetail'
import { usePrefs } from '../settings/usePrefs'
import { formatWeight } from '../../domain'

function HeaderCard({ header }: { header: SessionHeader }) {
  const unit = usePrefs(s => s.weightUnit)
  const meta = [
    header.sessionType,
    header.programVariant ? `${header.programVariant}${header.programWeek ? ` · wk ${header.programWeek}` : ''}` : null,
    header.durationMinutes != null ? `${header.durationMinutes} min` : null,
    header.bodyWeight != null ? `BW ${formatWeight(header.bodyWeight, unit)}` : null,
  ].filter(Boolean).join(' · ')
  return (
    <Card>
      <p className="font-medium text-text">{header.date}</p>
      {meta ? <p className="text-sm text-muted">{meta}</p> : null}
      {header.notes ? <p className="mt-2 text-sm text-muted">{header.notes}</p> : null}
    </Card>
  )
}

function Body({ detail }: { detail: SessionDetail }) {
  const unit = usePrefs(s => s.weightUnit)
  if (detail.kind === 'strength') {
    if (detail.exercises.length === 0) return <Card><p className="text-muted">Nothing recorded for this session.</p></Card>
    return (
      <div className="space-y-3">
        {detail.exercises.map((ex, i) => (
          <Card key={`${ex.exerciseName}-${i}`} className="space-y-3">
            <p className="truncate text-lg font-semibold text-text">{ex.exerciseName}</p>
            <div className="space-y-2">
              {ex.sets.map((s, j) => (
                <div key={j} className="flex items-center gap-3 text-sm">
                  <span className="w-12 shrink-0 text-muted">Set {j + 1}</span>
                  <span className="text-text">{formatSet(s, unit)}</span>
                  {s.isWarmup ? <span className="rounded bg-surface-hover px-1.5 py-0.5 text-xs text-muted">Warm-up</span> : null}
                </div>
              ))}
            </div>
          </Card>
        ))}
        <p className="text-sm text-muted">Strength sessions can&apos;t be deleted yet.</p>
      </div>
    )
  }
  if (detail.kind === 'cardio') {
    const line = [
      detail.distanceKm != null ? `${Number(detail.distanceKm.toFixed(2))} km` : null,
      detail.durationMinutes != null ? `${detail.durationMinutes} min` : null,
      detail.pace ? `${detail.pace} /km` : null,
    ].filter(Boolean).join(' · ')
    return (
      <Card>
        <p className="font-medium text-text">{detail.activity}</p>
        {line ? <p className="text-sm text-muted">{line}</p> : null}
      </Card>
    )
  }
  // climbing
  if (detail.sends.length === 0) return <Card><p className="text-muted">Nothing recorded for this session.</p></Card>
  return (
    <Card className="space-y-1">
      {detail.sends.map((s, i) => (
        <p key={i} className="text-sm text-muted">{s.grade} · {s.count} sent / {s.attempts} tried</p>
      ))}
      <p className="mt-1 text-sm text-text">
        {detail.totalSends} send{detail.totalSends === 1 ? '' : 's'} · {detail.totalAttempts} attempt{detail.totalAttempts === 1 ? '' : 's'}
      </p>
    </Card>
  )
}

export function SessionDetailPage() {
  const { sessionId } = useParams()
  const nav = useNavigate()
  const { data: detail, isLoading } = useSessionDetail(sessionId)
  const deleteSession = useDeleteSession()
  const [error, setError] = useState<string | null>(null)

  const canDelete = detail && detail.kind !== 'strength'

  function handleDelete() {
    if (!sessionId || !window.confirm('Delete this session?')) return
    setError(null)
    deleteSession.mutate(sessionId, {
      onSuccess: () => nav('/history'),
      onError: () => setError('Could not delete. Please try again.'),
    })
  }

  return (
    <AppShell title="Session" onBack={() => nav('/history')}>
      {isLoading ? (
        <p className="text-muted">Loading…</p>
      ) : !detail ? (
        <Card><p className="text-muted">Session not found.</p></Card>
      ) : (
        <div className="space-y-4">
          <HeaderCard header={detail.header} />
          <Body detail={detail} />
          {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
          {canDelete ? (
            <Button variant="secondary" fullWidth onClick={handleDelete} disabled={deleteSession.isPending}>
              {deleteSession.isPending ? 'Deleting…' : 'Delete session'}
            </Button>
          ) : null}
        </div>
      )}
    </AppShell>
  )
}
