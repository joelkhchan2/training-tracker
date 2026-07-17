import type { KeyboardEvent } from 'react'
import { Card } from '../../components/ui/Card'
import { cn } from '../../lib/cn'
import type { PresetMeta } from '../../domain/presets'
import type { Discipline } from '../../domain/types'

export interface ProgramCardProps {
  preset: PresetMeta
  /** True when this preset's name matches the user's currently active program. */
  isActive: boolean
  onSelect: (preset: PresetMeta) => void
}

const disciplineLabel: Record<Discipline, string> = {
  strength: 'Strength',
  climbing: 'Climbing',
  cardio: 'Cardio',
  calisthenics: 'Calisthenics',
}

/** One preset in the programs library: name, description, discipline/days-per-week
 *  badges, and a "Current" badge when it matches the active program. The whole card
 *  is a single large tap target (role="button") that opens the preview. */
export function ProgramCard({ preset, isActive, onSelect }: ProgramCardProps) {
  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onSelect(preset)
    }
  }

  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={() => onSelect(preset)}
      onKeyDown={handleKeyDown}
      className={cn(
        'w-full cursor-pointer space-y-2 text-left transition-colors hover:bg-surface-hover',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-lg font-semibold text-text">{preset.name}</h2>
        {isActive ? (
          <span className="inline-flex shrink-0 items-center rounded-full bg-accent/20 px-2 py-0.5 text-xs font-semibold text-accent">
            Current
          </span>
        ) : null}
      </div>
      <p className="text-sm text-muted">{preset.description}</p>
      <div className="flex gap-2 text-xs font-medium text-muted">
        <span className="rounded-full border border-border px-2 py-0.5">
          {disciplineLabel[preset.discipline]}
        </span>
        <span className="rounded-full border border-border px-2 py-0.5">
          {preset.daysPerWeek} days/week
        </span>
      </div>
    </Card>
  )
}
