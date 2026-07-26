import { AppShell } from '../../components/ui/AppShell'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { useAuth } from '../../lib/useAuth'
import { useProfile, useUpdateDisciplines } from '../../data/profile'
import { cn } from '../../lib/cn'
import { usePrefs } from './usePrefs'
import { THEMES, FONTS, SCALES, fontStack, type ThemeId } from './prefs'
import type { Discipline } from '../../domain'

const DISCIPLINES: { key: Discipline; label: string }[] = [
  { key: 'strength', label: 'Strength' },
  { key: 'climbing', label: 'Climbing' },
  { key: 'cardio', label: 'Cardio' },
  { key: 'calisthenics', label: 'Calisthenics' },
]

const CORE_THEMES = THEMES.filter(t => t.group === 'core')
const SEASONAL_THEMES = THEMES.filter(t => t.group === 'seasonal')

// "System" preview mixes the two concrete themes System resolves to, so the
// swatch stays honest without hard-coding colors that could drift from prefs.ts.
const SYSTEM_PREVIEW_BG = `linear-gradient(135deg, ${THEMES.find(t => t.id === 'midnight')!.bg} 50%, ${THEMES.find(t => t.id === 'daylight')!.bg} 50%)`

interface ThemeOption {
  id: ThemeId
  label: string
  bg: string
  mode: 'dark' | 'light' | 'auto'
}

const SYSTEM_OPTION: ThemeOption = { id: 'system', label: 'System', bg: SYSTEM_PREVIEW_BG, mode: 'auto' }

function ThemeSwatchButton({ option, active, onSelect }: { option: ThemeOption; active: boolean; onSelect: () => void }) {
  const dotColor = option.mode === 'light' ? '#111111' : '#ffffff'
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onSelect}
      className={cn(
        'flex min-h-[44px] items-center gap-2 rounded-xl border border-border px-3 py-2 text-left text-sm text-text transition-colors',
        active ? 'border-accent ring-2 ring-accent' : 'hover:border-accent/50',
      )}
    >
      <span className="relative h-6 w-6 shrink-0 rounded-full border border-border/50" style={{ background: option.bg }}>
        <span className="absolute right-0 top-0 h-2 w-2 rounded-full" style={{ background: dotColor }} />
      </span>
      <span className="flex-1">{option.label}</span>
      {active && <span aria-hidden="true">✓</span>}
    </button>
  )
}

export function SettingsPage() {
  const { user, signOut } = useAuth()
  const { data: profile, isLoading } = useProfile(user?.id)
  const updateDisciplines = useUpdateDisciplines()

  const theme = usePrefs(s => s.theme)
  const fontFamily = usePrefs(s => s.fontFamily)
  const fontScale = usePrefs(s => s.fontScale)
  const setTheme = usePrefs(s => s.setTheme)
  const setFontFamily = usePrefs(s => s.setFontFamily)
  const setFontScale = usePrefs(s => s.setFontScale)

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

        <Card className="space-y-4">
          <h2 className="text-lg font-semibold text-text">Appearance</h2>

          <div className="space-y-2" role="group" aria-label="Theme">
            <h3 className="text-sm font-medium text-muted">Theme</h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <ThemeSwatchButton option={SYSTEM_OPTION} active={theme === 'system'} onSelect={() => setTheme('system')} />
              {CORE_THEMES.map(t => (
                <ThemeSwatchButton key={t.id} option={t} active={theme === t.id} onSelect={() => setTheme(t.id)} />
              ))}
            </div>
            {SEASONAL_THEMES.length > 0 && (
              <>
                <h3 className="pt-2 text-sm font-medium text-muted">Seasonal</h3>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {SEASONAL_THEMES.map(t => (
                    <ThemeSwatchButton key={t.id} option={t} active={theme === t.id} onSelect={() => setTheme(t.id)} />
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="space-y-2" role="group" aria-label="Font">
            <h3 className="text-sm font-medium text-muted">Font</h3>
            <div className="flex flex-wrap gap-2">
              {FONTS.map(f => {
                const active = fontFamily === f.id
                return (
                  <button
                    key={f.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setFontFamily(f.id)}
                    style={{ fontFamily: fontStack(f.id) }}
                    className={cn(
                      'min-h-[44px] rounded-xl border border-border px-4 py-2 text-sm text-text transition-colors',
                      active ? 'border-accent ring-2 ring-accent' : 'hover:border-accent/50',
                    )}
                  >
                    {f.label}
                  </button>
                )
              })}
            </div>
            <p className="text-xs text-muted">Rounded uses Apple’s rounded system font where available; other platforms fall back to the system font.</p>
          </div>

          <div className="space-y-2" role="group" aria-label="Text size">
            <h3 className="text-sm font-medium text-muted">Text size</h3>
            <div className="flex flex-wrap gap-2">
              {SCALES.map(s => {
                const active = fontScale === s.value
                return (
                  <button
                    key={s.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setFontScale(s.value)}
                    className={cn(
                      'flex min-h-[44px] min-w-[44px] flex-col items-center gap-1 rounded-xl border border-border px-4 py-2 text-text transition-colors',
                      active ? 'border-accent ring-2 ring-accent' : 'hover:border-accent/50',
                    )}
                  >
                    <span className="tabular-nums leading-none" style={{ fontSize: `${18 * s.value}px` }}>18</span>
                    <span className="text-xs text-muted">{s.label}</span>
                  </button>
                )
              })}
            </div>
          </div>
        </Card>

        <Button variant="secondary" fullWidth onClick={signOut}>
          Sign out
        </Button>
      </div>
    </AppShell>
  )
}
