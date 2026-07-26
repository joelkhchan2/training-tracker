import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
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

describe('AppShell onBack', () => {
  it('shows no back button by default', () => {
    render(<AppShell title="History">body</AppShell>)
    expect(screen.queryByLabelText('Back')).toBeNull()
  })

  it('renders a back button that calls onBack when provided', () => {
    const onBack = vi.fn()
    render(<AppShell title="Session" onBack={onBack}>body</AppShell>)
    fireEvent.click(screen.getByLabelText('Back'))
    expect(onBack).toHaveBeenCalledTimes(1)
  })
})

describe('AppShell centered column', () => {
  it('wraps children in a centered max-w-md column', () => {
    render(<AppShell title="X">body</AppShell>)
    const wrapper = screen.getByText('body')
    expect(wrapper.className).toContain('max-w-md')
    expect(wrapper.className).toContain('mx-auto')
  })
})
