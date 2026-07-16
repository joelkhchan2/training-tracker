import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Card } from './Card'

describe('Card', () => {
  it('renders its children', () => {
    render(
      <Card>
        <p>Bench Press</p>
      </Card>,
    )
    expect(screen.getByText('Bench Press')).toBeInTheDocument()
  })

  it('merges a caller-supplied className with its defaults', () => {
    render(<Card className="mt-4" data-testid="card" />)
    const card = screen.getByTestId('card')
    expect(card.className).toContain('mt-4')
    expect(card.className).toContain('rounded-2xl')
  })
})
