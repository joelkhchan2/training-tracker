import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import type { Discipline, Program, Scheme } from '../../domain/types'

/** Common view-model `ProgramPreview` renders from: the fields shared by a built-in
 *  `PresetMeta` and a DB-authored `LibraryProgram` (see `src/domain/presets` and
 *  `src/data/programLibrary.ts`). Both already have every field this shape needs, so
 *  either can be passed straight through as `program` — no explicit mapping required. */
export interface PreviewProgram {
  name: string
  description: string
  discipline: Discipline
  daysPerWeek: number
  program: Program
}

export interface ProgramPreviewProps {
  program: PreviewProgram
  onUse: () => void
  /** Shown only when the viewer owns this program (a preset or someone else's
   *  community program has no edit action). */
  onEdit?: () => void
}

/** Compact scheme summary for the library preview, e.g. "3×5, 1×5" for a fixed
 *  scheme (consecutive sets sharing a rep count are grouped), or "%-based" for a
 *  percentage scheme — actual weights depend on the user's training maxes, which
 *  aren't known until after the program is activated, so the preview names the
 *  scheme type rather than computing a (misleading, TM-less) weight. */
function formatScheme(scheme: Scheme): string {
  if (scheme.type === 'percentage') return '%-based'
  const groups: { reps: number; count: number }[] = []
  for (const s of scheme.sets) {
    const last = groups[groups.length - 1]
    if (last && last.reps === s.reps) last.count += 1
    else groups.push({ reps: s.reps, count: 1 })
  }
  return groups.map(g => `${g.count}×${g.reps}`).join(', ')
}

/** Read-only preview of a preset or DB program: every day with its exercises and a
 *  compact scheme summary per exercise, plus a primary CTA to advance to activation
 *  and (for owned programs) a secondary Edit action. */
export function ProgramPreview({ program, onUse, onEdit }: ProgramPreviewProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {program.program.days.map((day, dayIdx) => (
          <Card key={`${day.name}-${dayIdx}`} className="space-y-2">
            <h3 className="text-base font-semibold text-text">{day.name}</h3>
            <ul className="space-y-1.5">
              {day.exercises.map((ex, exIdx) => (
                <li
                  key={`${ex.exerciseName}-${exIdx}`}
                  className="flex items-baseline justify-between gap-3 text-sm"
                >
                  <span className="text-text">{ex.exerciseName}</span>
                  <span className="shrink-0 text-muted">{formatScheme(ex.scheme)}</span>
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>

      {onEdit ? (
        <div className="flex gap-3">
          <Button variant="secondary" fullWidth onClick={onEdit}>
            Edit
          </Button>
          <Button fullWidth onClick={onUse}>
            Use this program
          </Button>
        </div>
      ) : (
        <Button fullWidth onClick={onUse}>
          Use this program
        </Button>
      )}
    </div>
  )
}
