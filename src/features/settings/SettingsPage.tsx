import { AppShell } from '../../components/ui/AppShell'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { useAuth } from '../../lib/useAuth'
import { useProfile, useUpdateDisciplines } from '../../data/profile'
import type { Discipline } from '../../domain'

const DISCIPLINES: { key: Discipline; label: string }[] = [
  { key: 'strength', label: 'Strength' },
  { key: 'climbing', label: 'Climbing' },
  { key: 'cardio', label: 'Cardio' },
  { key: 'calisthenics', label: 'Calisthenics' },
]

export function SettingsPage() {
  const { user, signOut } = useAuth()
  const { data: profile, isLoading } = useProfile(user?.id)
  const updateDisciplines = useUpdateDisciplines()

  const enabled = profile?.enabled_disciplines ?? []

  function toggle(key: Discipline, on: boolean) {
    if (!user) return
    const next = on ? [...enabled, key] : enabled.filter(d => d !== key)
    updateDisciplines.mutate({ userId: user.id, disciplines: next })
  }

  return (
    <AppShell title="Settings">
      <div className="space-y-4">
        <Card className="space-y-3">
          <h2 className="text-lg font-semibold text-text">Disciplines</h2>
          {isLoading ? (
            <p className="text-muted">Loading…</p>
          ) : (
            DISCIPLINES.map(d => (
              <label key={d.key} className="flex items-center justify-between gap-3">
                <span className="text-text">{d.label}</span>
                <input
                  type="checkbox"
                  aria-label={d.label}
                  checked={enabled.includes(d.key)}
                  onChange={e => toggle(d.key, e.target.checked)}
                  disabled={updateDisciplines.isPending}
                />
              </label>
            ))
          )}
        </Card>
        <Button variant="secondary" fullWidth onClick={signOut}>
          Sign out
        </Button>
      </div>
    </AppShell>
  )
}
