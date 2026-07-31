import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ProgramCard } from './ProgramCard'
import type { PresetMeta } from '../../domain/presets'

function makePreset(discipline: PresetMeta['discipline']): PresetMeta {
  return {
    id: 'x', name: 'Test', description: 'desc', discipline, daysPerWeek: 3,
    requiresTrainingMaxes: false, tmKeys: [], requiresStartingWeights: false, startingWeightLifts: [],
    program: { name: 'Test', discipline, days: [] },
  }
}

describe('ProgramCard disciplineLabel', () => {
  it('renders a "Mixed" badge for a mixed program (no blank, no crash)', () => {
    render(<ProgramCard preset={makePreset('mixed')} isActive={false} onSelect={vi.fn()} />)
    expect(screen.getByText('Mixed')).toBeInTheDocument()
  })
  it('renders "Strength" for a strength program', () => {
    render(<ProgramCard preset={makePreset('strength')} isActive={false} onSelect={vi.fn()} />)
    expect(screen.getByText('Strength')).toBeInTheDocument()
  })
})
