import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { BottomNav } from './BottomNav'

describe('BottomNav', () => {
  it('renders all five tabs as links', () => {
    render(<MemoryRouter><BottomNav /></MemoryRouter>)
    for (const label of ['Home', 'History', 'Progress', 'Programs', 'Settings']) {
      expect(screen.getByRole('link', { name: label })).toBeInTheDocument()
    }
  })

  it('renders a Progress tab linking to /progress', () => {
    render(<MemoryRouter><BottomNav /></MemoryRouter>)
    const link = screen.getByRole('link', { name: 'Progress' })
    expect(link.getAttribute('href')).toMatch(/\/progress$/)
  })
})
