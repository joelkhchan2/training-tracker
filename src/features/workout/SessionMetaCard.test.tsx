import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, beforeEach } from 'vitest'
import { SessionMetaCard } from './SessionMetaCard'
import { useSessionStore } from './sessionStore'

describe('SessionMetaCard', () => {
  beforeEach(() => useSessionStore.getState().reset())
  it('writes notes and body-weight to the store', () => {
    render(<SessionMetaCard />)
    fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'good session' } })
    fireEvent.change(screen.getByLabelText(/Body weight/i), { target: { value: '181.5' } })
    expect(useSessionStore.getState().notes).toBe('good session')
    expect(useSessionStore.getState().bodyWeight).toBe(181.5)
  })
  it('body-weight empty maps to null', () => {
    useSessionStore.getState().setBodyWeight(200)
    render(<SessionMetaCard />)
    fireEvent.change(screen.getByLabelText(/Body weight/i), { target: { value: '' } })
    expect(useSessionStore.getState().bodyWeight).toBeNull()
  })
})
