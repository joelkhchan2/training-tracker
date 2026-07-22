import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { BottomNav } from './BottomNav'

describe('BottomNav', () => {
  it('renders all four tabs as links', () => {
    render(<MemoryRouter><BottomNav /></MemoryRouter>)
    for (const label of ['Home', 'History', 'Programs', 'Settings']) {
      expect(screen.getByRole('link', { name: label })).toBeInTheDocument()
    }
  })
})
