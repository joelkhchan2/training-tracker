import { useState } from 'react'
import { AppShell } from '../../components/ui/AppShell'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { useAuth } from '../../lib/useAuth'
import { useProfile, useUpdateDisciplines } from '../../data/profile'
import { cn } from '../../lib/cn'
import { usePrefs } from './usePrefs'
import { THEMES, FONTS, SCALES, fontStack, type ThemeId } from './prefs'
import { formatElapsed } from '../workout/formatElapsed'
import type { Discipline } from '../../domain'

const DISCIPLINES: { key: Discipline; label: string }[] = [
  { key: 'strength', label: 'Strength' },
  { key: 'climbing', label: 'Climbing' },
  { key: 'cardio', label: 'Cardio' },
  { key: 'calisthenics', label: 'Calisthenics' },
]

// "System" preview mixes the two concrete themes System resolves to, so the
// swatch stays honest without hard-coding colors that could drift from prefs.ts.
const SYSTEM_PREVIEW_BG = `linear-gradient(135deg, ${THEMES.find(t => t.id === 'midnight')!.bg} 50%, ${THEMES.find(t => t.id === 'daylight')!.bg} 50%)`

interface ThemeOption {
  id: ThemeId
  label: string
  bg: string
  mode: 'dark' | 'light' | 'auto'
  surface?: string
  accent?: string
}

const SYSTEM_OPTION: ThemeOption = { id: 'system', label: 'System', bg: SYSTEM_PREVIEW_BG, mode: 'auto' }

// Mirrors RestTimerPill's own PRESETS — duplicated rather than imported/exported to keep
// this Settings-only change scoped to a single file (RestTimerPill.tsx untouched).
const REST_TIMER_PRESETS = [90, 120, 180, 300]
const WEEK_START_DAYS = ['monday', 'sunday'] as const

function ThemeSwatchButton({ option, active, onSelect }: { option: ThemeOption; active: boolean; onSelect: () => void }) {
  const accentColor = option.accent ?? (option.mode === 'light' ? '#111111' : '#ffffff')
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
      <span className="relative h-6 w-6 shrink-0 overflow-hidden rounded-full border border-border/50" style={{ background: option.bg }}>
        {option.surface ? (
          <span className="absolute bottom-0.5 left-0.5 h-2.5 w-2.5 rounded-sm" style={{ background: option.surface }} />
        ) : null}
        <span className="absolute right-0 top-0 h-2 w-2 rounded-full" style={{ background: accentColor }} />
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

  const weekStartDay = usePrefs(s => s.weekStartDay)
  const restTimerDefaultSeconds = usePrefs(s => s.restTimerDefaultSeconds)
  const restTimerHaptics = usePrefs(s => s.restTimerHaptics)
  const showRpe = usePrefs(s => s.showRpe)
  const setWeekStartDay = usePrefs(s => s.setWeekStartDay)
  const setRestTimerDefaultSeconds = usePrefs(s => s.setRestTimerDefaultSeconds)
  const setRestTimerHaptics = usePrefs(s => s.setRestTimerHaptics)
  const setShowRpe = usePrefs(s => s.setShowRpe)

  const [customMin, setCustomMin] = useState('')
  const [customSec, setCustomSec] = useState('')

  function submitCustomRestDuration() {
    const secs = (Number(customMin) || 0) * 60 + (Number(customSec) || 0)
    if (secs > 0) setRestTimerDefaultSeconds(secs)
  }

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
              {THEMES.map(t => (
                <ThemeSwatchButton key={t.id} option={t} active={theme === t.id} onSelect={() => setTheme(t.id)} />
              ))}
            </div>
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
                    <span className="text-sm font-medium leading-none">{s.label}</span>
                    <span aria-hidden="true" className="tabular-nums leading-none text-muted" style={{ fontSize: `${18 * s.value}px` }}>Aa</span>
                  </button>
                )
              })}
            </div>
          </div>
        </Card>

        <Card className="space-y-4">
          <h2 className="text-lg font-semibold text-text">Logging</h2>

          <div className="space-y-2" role="group" aria-label="Week start">
            <h3 className="text-sm font-medium text-muted">Week start</h3>
            <div className="flex flex-wrap gap-2">
              {WEEK_START_DAYS.map((day) => {
                const active = weekStartDay === day
                return (
                  <button
                    key={day}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setWeekStartDay(day)}
                    className={cn(
                      'min-h-[44px] rounded-xl border border-border px-4 py-2 text-sm capitalize text-text transition-colors',
                      active ? 'border-accent ring-2 ring-accent' : 'hover:border-accent/50',
                    )}
                  >
                    {day}
                  </button>
                )
              })}
            </div>
            <p className="text-xs text-muted">Used for weekly summaries when they ship — no effect yet.</p>
          </div>

          <div className="space-y-2" role="group" aria-label="Rest timer default">
            <h3 className="text-sm font-medium text-muted">Rest timer default</h3>
            <div className="flex flex-wrap gap-2">
              {REST_TIMER_PRESETS.map((p) => {
                const active = restTimerDefaultSeconds === p
                return (
                  <button
                    key={p}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setRestTimerDefaultSeconds(p)}
                    className={cn(
                      'min-h-[44px] rounded-xl border border-border px-4 py-2 text-sm text-text transition-colors',
                      active ? 'border-accent ring-2 ring-accent' : 'hover:border-accent/50',
                    )}
                  >
                    {formatElapsed(p)}
                  </button>
                )
              })}
            </div>
            <div className="flex items-center gap-1">
              <input
                aria-label="Custom minutes"
                type="number"
                inputMode="numeric"
                min={0}
                value={customMin}
                onChange={(e) => setCustomMin(e.target.value)}
                placeholder="m"
                className="w-14 rounded-lg border border-border bg-surface px-2 py-2 text-center text-sm text-text"
              />
              <span className="text-sm text-muted">:</span>
              <input
                aria-label="Custom seconds"
                type="number"
                inputMode="numeric"
                min={0}
                max={59}
                value={customSec}
                onChange={(e) => setCustomSec(e.target.value)}
                placeholder="s"
                className="w-14 rounded-lg border border-border bg-surface px-2 py-2 text-center text-sm text-text"
              />
              <button
                type="button"
                onClick={submitCustomRestDuration}
                className="min-h-[44px] rounded-xl border border-border px-4 py-2 text-sm text-text hover:border-accent/50"
              >
                Set
              </button>
            </div>
          </div>

          <label className="flex items-center justify-between gap-3">
            <span className="text-text">Vibrate when rest timer ends</span>
            <input
              type="checkbox"
              aria-label="Vibrate when rest timer ends"
              checked={restTimerHaptics}
              onChange={(e) => setRestTimerHaptics(e.target.checked)}
            />
          </label>

          <label className="flex items-center justify-between gap-3">
            <span className="text-text">Show RPE when logging sets</span>
            <input
              type="checkbox"
              aria-label="Show RPE when logging sets"
              checked={showRpe}
              onChange={(e) => setShowRpe(e.target.checked)}
            />
          </label>
        </Card>

        <Button variant="secondary" fullWidth onClick={signOut}>
          Sign out
        </Button>
      </div>
    </AppShell>
  )
}
