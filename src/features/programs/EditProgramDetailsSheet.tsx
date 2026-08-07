import { useState } from 'react'
import { Button } from '../../components/ui/Button'
import { TextField } from '../../components/ui/TextField'
import { Textarea } from '../../components/ui/Textarea'
import { useUpdateProgramDetails } from '../../data/saveProgram'

export interface EditProgramDetailsSheetProps {
  programId: string
  initialName: string
  initialDescription: string
  onClose: () => void
}

/**
 * Lightweight edit for a program's name + description only. Saves via
 * `useUpdateProgramDetails` (a single own-row `programs` UPDATE), so it works for any
 * owned program — including presets cloned on activation, whose advanced schemes the
 * full builder can't load. On error the entered values stay put so the user can retry.
 */
export function EditProgramDetailsSheet({ programId, initialName, initialDescription, onClose }: EditProgramDetailsSheetProps) {
  const update = useUpdateProgramDetails()
  const [name, setName] = useState(initialName)
  const [description, setDescription] = useState(initialDescription)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const canSave = name.trim().length > 0 && !update.isPending

  function handleSave() {
    if (!name.trim()) {
      setErrorMsg('Program name is required.')
      return
    }
    setErrorMsg(null)
    update.mutate(
      { programId, name, description },
      {
        onSuccess: () => onClose(),
        onError: (err) => setErrorMsg(err.message || 'Could not save. Please try again.'),
      },
    )
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Edit program details"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center"
    >
      <div
        className="w-full max-w-md space-y-4 rounded-t-2xl border border-border bg-surface p-6 sm:rounded-2xl"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1.5rem)' }}
      >
        <h2 className="text-xl font-semibold text-text">Edit program details</h2>

        <TextField label="Program name" value={name} onChange={setName} />
        <Textarea label="Description" value={description} onChange={setDescription} rows={3} />

        {errorMsg ? (
          <p role="alert" className="text-sm text-danger">
            {errorMsg}
          </p>
        ) : null}

        <div className="flex gap-3">
          <Button variant="secondary" fullWidth onClick={onClose} disabled={update.isPending}>
            Cancel
          </Button>
          <Button fullWidth onClick={handleSave} disabled={!canSave}>
            {update.isPending ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>
    </div>
  )
}
