import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppShell } from '../../components/ui/AppShell'
import { Card } from '../../components/ui/Card'
import { NumberField } from '../../components/ui/NumberField'
import { WeightField } from '../../components/ui/WeightField'
import { epley1RM, round1, percentageTable, formatWeight } from '../../domain'
import { usePrefs } from '../settings/usePrefs'

export function OneRepMaxCalculatorPage() {
  const nav = useNavigate()
  const [weight, setWeight] = useState(100)
  const [reps, setReps] = useState(5)
  const unit = usePrefs(s => s.weightUnit)

  const raw = epley1RM(weight, reps)
  const valid = weight > 0 && reps > 0
  const table = valid ? percentageTable(raw) : []

  return (
    <AppShell title="1RM Calculator" onBack={() => nav('/progress')}>
      <div className="space-y-4">
        <Card className="space-y-4">
          <WeightField label="Weight" valueLb={weight} onChangeLb={setWeight} min={0} stepLb={2.5} />
          <NumberField label="Reps" value={reps} onChange={setReps} min={1} step={1} />
        </Card>
        {valid ? (
          <>
            <Card>
              <p className="text-sm text-muted">Estimated 1RM</p>
              <p className="text-3xl font-bold text-text">{formatWeight(round1(raw), unit)}</p>
            </Card>
            <Card className="space-y-1">
              <p className="text-sm text-muted">% of 1RM</p>
              {table.map(row => (
                <div key={row.pct} className="flex justify-between text-text">
                  <span className="text-muted">{row.pct}%</span>
                  <span className="font-medium">{formatWeight(row.load, unit)}</span>
                </div>
              ))}
            </Card>
          </>
        ) : (
          <p className="text-muted">Enter a weight and reps.</p>
        )}
      </div>
    </AppShell>
  )
}
