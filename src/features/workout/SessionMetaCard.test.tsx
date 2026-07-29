import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { SessionMetaCard } from './SessionMetaCard'
import { useSessionStore } from './sessionStore'
import { usePrefs } from '../settings/usePrefs'

describe('SessionMetaCard', () => {
  beforeEach(() => useSessionStore.getState().reset())
  afterEach(() => usePrefs.setState({ weightUnit: 'lb' }))

  it('writes notes and body-weight to the store', () => {
    render(<SessionMetaCard />)
    fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'good session' } })
    fireEvent.change(screen.getByLabelText('Body weight'), { target: { value: '181.5' } })
    expect(useSessionStore.getState().notes).toBe('good session')
    expect(useSessionStore.getState().bodyWeight).toBe(181.5)
  })

  it('body-weight empty maps to null', () => {
    useSessionStore.getState().setBodyWeight(200)
    render(<SessionMetaCard />)
    fireEvent.change(screen.getByLabelText('Body weight'), { target: { value: '' } })
    expect(useSessionStore.getState().bodyWeight).toBeNull()
  })

  it('kg mode: pins the "Body weight (kg)" label, converts the value, and writes lb back (empty → null)', () => {
    usePrefs.setState({ weightUnit: 'kg' })
    useSessionStore.getState().setBodyWeight(181.5)
    render(<SessionMetaCard />)
    expect(screen.getByLabelText('Body weight (kg)')).toHaveValue(82.3) // round1(181.5 * 0.45359237)

    fireEvent.change(screen.getByLabelText('Body weight (kg)'), { target: { value: '80' } })
    expect(useSessionStore.getState().bodyWeight).toBe(176.4) // round1(80 / 0.45359237)

    fireEvent.change(screen.getByLabelText('Body weight (kg)'), { target: { value: '' } })
    expect(useSessionStore.getState().bodyWeight).toBeNull()
  })
})
