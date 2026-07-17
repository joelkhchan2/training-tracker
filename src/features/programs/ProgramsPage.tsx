import { useState } from 'react'
import { AppShell } from '../../components/ui/AppShell'
import { Button } from '../../components/ui/Button'
import { useAuth } from '../../lib/useAuth'
import { useActiveWorkout } from '../../data/queries'
import { PRESETS } from '../../domain/presets'
import type { PresetMeta } from '../../domain/presets'
import { ProgramCard } from './ProgramCard'
import { ProgramPreview } from './ProgramPreview'

export interface ProgramsPageProps {
  /** Fires when the user taps "Use this program" from the preview. Task 4 wires this
   *  to the activation flow (`useActivateProgram` + navigate to a training-max entry
   *  step); left as an optional prop so this screen ships and is testable on its own —
   *  the default just logs, a clear placeholder for the real handler to replace. */
  onUse?: (preset: PresetMeta) => void
}

/** Programs library: browse the built-in presets, tap one to preview its days and
 *  exercises, then "Use this program" to move on to activation (Task 4). */
export function ProgramsPage({ onUse }: ProgramsPageProps) {
  const { user } = useAuth()
  const { data: bundle } = useActiveWorkout(user?.id)
  const activeProgramName = bundle?.program.name
  const [selected, setSelected] = useState<PresetMeta | null>(null)

  function handleUse(preset: PresetMeta) {
    if (onUse) onUse(preset)
    else console.info('[ProgramsPage] TODO(Task 4): wire activation flow for', preset.name)
  }

  if (selected) {
    return (
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
    )
  }

  return (
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
  )
}
