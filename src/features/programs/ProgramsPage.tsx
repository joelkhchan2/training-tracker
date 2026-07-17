import { useState } from 'react'
import { AppShell } from '../../components/ui/AppShell'
import { Button } from '../../components/ui/Button'
import { useAuth } from '../../lib/useAuth'
import { useActiveWorkout } from '../../data/queries'
import { PRESETS } from '../../domain/presets'
import type { PresetMeta } from '../../domain/presets'
import { ProgramCard } from './ProgramCard'
import { ProgramPreview } from './ProgramPreview'
import { ActivateSheet } from './ActivateSheet'

export interface ProgramsPageProps {
  /** Overrides what happens when the user taps "Use this program" from the preview.
   *  Left as an optional escape hatch for tests that want to assert on the tapped
   *  preset directly; the app itself never passes this, so the default — opening
   *  `ActivateSheet` — is what actually ships. */
  onUse?: (preset: PresetMeta) => void
}

/** Programs library: browse the built-in presets, tap one to preview its days and
 *  exercises, then "Use this program" to move on to activation via `ActivateSheet`. */
export function ProgramsPage({ onUse }: ProgramsPageProps) {
  const { user } = useAuth()
  const { data: bundle } = useActiveWorkout(user?.id)
  const activeProgramName = bundle?.program.name
  const [selected, setSelected] = useState<PresetMeta | null>(null)
  const [activating, setActivating] = useState<PresetMeta | null>(null)

  function handleUse(preset: PresetMeta) {
    if (onUse) onUse(preset)
    else setActivating(preset)
  }

  return (
    <>
      {selected ? (
        <AppShell
          title={selected.name}
          right={
            <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>
              Back
            </Button>
          }
        >
          <ProgramPreview preset={selected} onUse={handleUse} />
        </AppShell>
      ) : (
        <AppShell title="Programs">
          <div className="space-y-3">
            {PRESETS.map(preset => (
              <ProgramCard
                key={preset.id}
                preset={preset}
                isActive={preset.name === activeProgramName}
                onSelect={setSelected}
              />
            ))}
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
