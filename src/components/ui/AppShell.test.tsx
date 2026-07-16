import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AppShell } from './AppShell'

describe('AppShell', () => {
  it('renders the title, right slot, and children', () => {
    render(
      <AppShell title="Today's Workout" right={<button>Finish</button>}>
        <p>Squat 5x5</p>
      </AppShell>,
    )
    expect(screen.getByRole('heading', { name: "Today's Workout" })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Finish' })).toBeInTheDocument()
    expect(screen.getByText('Squat 5x5')).toBeInTheDocument()
  })

  it('renders without a right slot', () => {
    render(<AppShell title="Home">Content</AppShell>)
    expect(screen.getByRole('heading', { name: 'Home' })).toBeInTheDocument()
    expect(screen.getByText('Content')).toBeInTheDocument()
  })
})
