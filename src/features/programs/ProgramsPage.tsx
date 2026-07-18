import { useState } from 'react'
import type { KeyboardEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppShell } from '../../components/ui/AppShell'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { useAuth } from '../../lib/useAuth'
import { useActiveWorkout } from '../../data/queries'
import { usePublicPrograms } from '../../data/programLibrary'
import type { LibraryProgram } from '../../data/programLibrary'
import { useDeleteProgram } from '../../data/saveProgram'
import { useActivateDbProgram } from '../../data/activateProgram'
import { PRESETS } from '../../domain/presets'
import type { PresetMeta } from '../../domain/presets'
import type { Discipline } from '../../domain/types'
import { cn } from '../../lib/cn'
import { ProgramCard } from './ProgramCard'
import { ProgramPreview } from './ProgramPreview'
import { ActivateSheet } from './ActivateSheet'

export interface ProgramsPageProps {
  /** Overrides what happens when the user taps "Use this program" from the preview
   *  of a PRESET. Left as an optional escape hatch for tests that want to assert on
   *  the tapped preset directly; the app itself never passes this, so the default —
   *  opening `ActivateSheet` — is what actually ships. DB programs (own or community)
   *  never go through this hatch — they always route to `useActivateDbProgram`. */
  onUse?: (preset: PresetMeta) => void
}

/** Tags a selected library entry with which activation path it needs: a preset
 *  goes through `ActivateSheet` (may need training maxes/starting weights), a DB
 *  program (own or community) is always fixed-scheme and activates directly via
 *  `useActivateDbProgram`. */
type Selection = { kind: 'preset'; preset: PresetMeta } | { kind: 'db'; program: LibraryProgram } | null

const disciplineLabel: Record<Discipline, string> = {
  strength: 'Strength',
  climbing: 'Climbing',
  cardio: 'Cardio',
  calisthenics: 'Calisthenics',
}

interface LibraryProgramCardProps {
  program: LibraryProgram
  isActive: boolean
  shared?: boolean
  onSelect: (program: LibraryProgram) => void
  onEdit?: () => void
  onDelete?: () => void
}

/** One DB-authored program in "My programs" or "Shared by the community": the same
 *  name/description/discipline/days-per-week layout as `ProgramCard` (the preset
 *  equivalent), plus a "Shared" badge for community entries and, for owned entries,
 *  Edit/Delete actions below the tap target. */
function LibraryProgramCard({ program, isActive, shared = false, onSelect, onEdit, onDelete }: LibraryProgramCardProps) {
  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onSelect(program)
    }
  }

  return (
    <div className="space-y-2">
      <Card
        role="button"
        tabIndex={0}
        onClick={() => onSelect(program)}
        onKeyDown={handleKeyDown}
        className={cn(
          'w-full cursor-pointer space-y-2 text-left transition-colors hover:bg-surface-hover',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-semibold text-text">{program.name}</h2>
          <div className="flex shrink-0 items-center gap-2">
            {shared ? (
              <span className="inline-flex items-center rounded-full bg-border px-2 py-0.5 text-xs font-semibold text-muted">
                Shared
              </span>
            ) : null}
            {isActive ? (
              <span className="inline-flex items-center rounded-full bg-accent/20 px-2 py-0.5 text-xs font-semibold text-accent">
                Current
              </span>
            ) : null}
          </div>
        </div>
        <p className="text-sm text-muted">{program.description}</p>
        <div className="flex gap-2 text-xs font-medium text-muted">
          <span className="rounded-full border border-border px-2 py-0.5">
            {disciplineLabel[program.discipline]}
          </span>
          <span className="rounded-full border border-border px-2 py-0.5">
            {program.daysPerWeek} days/week
          </span>
        </div>
      </Card>
      {onEdit || onDelete ? (
        <div className="flex gap-2 px-1">
          {onEdit ? (
            <Button variant="secondary" size="sm" onClick={onEdit}>
              Edit
            </Button>
          ) : null}
          {onDelete ? (
            <Button variant="danger" size="sm" onClick={onDelete}>
              Delete
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

/** Programs library: browse the built-in presets plus any DB-authored programs (the
 *  viewer's own and public ones shared by the community), tap one to preview its
 *  days and exercises, then "Use this program" to activate. Presets and DB programs
 *  take different activation paths (see `Selection` above) — this page just tags
 *  the selection and routes the preview's CTA accordingly. */
export function ProgramsPage({ onUse }: ProgramsPageProps) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { data: bundle } = useActiveWorkout(user?.id)
  const { data: library } = usePublicPrograms(user?.id)
  const activeProgramName = bundle?.program.name
  const own = library?.own ?? []
  const community = library?.community ?? []

  const [selected, setSelected] = useState<Selection>(null)
  const [activating, setActivating] = useState<PresetMeta | null>(null)
  const [dbError, setDbError] = useState<string | null>(null)

  const deleteProgram = useDeleteProgram()
  const activateDbProgram = useActivateDbProgram()

  function handleUsePreset(preset: PresetMeta) {
    if (onUse) onUse(preset)
    else setActivating(preset)
  }

  function handleUseDbProgram(program: LibraryProgram) {
    const confirmed = window.confirm(`Activate ${program.name}? This will replace your current active program.`)
    if (!confirmed) return
    setDbError(null)
    activateDbProgram.mutate(
      { programId: program.id },
      {
        onSuccess: () => navigate('/'),
        onError: (err) => setDbError(err.message || 'Could not activate this program. Please try again.'),
      },
    )
  }

  function handleUseSelected() {
    if (!selected) return
    if (selected.kind === 'preset') handleUsePreset(selected.preset)
    else handleUseDbProgram(selected.program)
  }

  function handleDelete(program: LibraryProgram) {
    const confirmed = window.confirm(`Delete "${program.name}"? This can't be undone.`)
    if (!confirmed) return
    deleteProgram.mutate({ programId: program.id })
  }

  return (
    <>
      {selected ? (
        <AppShell
          title={selected.kind === 'preset' ? selected.preset.name : selected.program.name}
          right={
            <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>
              Back
            </Button>
          }
        >
          <ProgramPreview
            program={selected.kind === 'preset' ? selected.preset : selected.program}
            onUse={handleUseSelected}
            onEdit={
              selected.kind === 'db' && selected.program.isOwn
                ? () => navigate(`/programs/${selected.program.id}/edit`)
                : undefined
            }
          />
          {dbError ? (
            <p role="alert" className="mt-3 text-sm text-danger">
              {dbError}
            </p>
          ) : null}
        </AppShell>
      ) : (
        <AppShell
          title="Programs"
          right={
            <Button size="sm" onClick={() => navigate('/programs/new')}>
              Create program
            </Button>
          }
        >
          <div className="space-y-6">
            <section className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Presets</h2>
              <div className="space-y-3">
                {PRESETS.map(preset => (
                  <ProgramCard
                    key={preset.id}
                    preset={preset}
                    isActive={preset.name === activeProgramName}
                    onSelect={(p) => setSelected({ kind: 'preset', preset: p })}
                  />
                ))}
              </div>
            </section>

            {own.length > 0 ? (
              <section className="space-y-3">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">My programs</h2>
                <div className="space-y-3">
                  {own.map(program => (
                    <LibraryProgramCard
                      key={program.id}
                      program={program}
                      isActive={program.name === activeProgramName}
                      onSelect={(p) => setSelected({ kind: 'db', program: p })}
                      onEdit={() => navigate(`/programs/${program.id}/edit`)}
                      onDelete={() => handleDelete(program)}
                    />
                  ))}
                </div>
              </section>
            ) : null}

            {community.length > 0 ? (
              <section className="space-y-3">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Shared by the community</h2>
                <div className="space-y-3">
                  {community.map(program => (
                    <LibraryProgramCard
                      key={program.id}
                      program={program}
                      isActive={program.name === activeProgramName}
                      shared
                      onSelect={(p) => setSelected({ kind: 'db', program: p })}
                    />
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        </AppShell>
      )}

      {activating ? (
        <ActivateSheet
          preset={activating}
          existingTrainingMaxes={bundle?.trainingMaxes}
          onClose={() => setActivating(null)}
        />
      ) : null}
    </>
  )
}
