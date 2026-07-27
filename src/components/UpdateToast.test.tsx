import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { UpdateToast } from './UpdateToast'

describe('UpdateToast', () => {
  it('announces a new version and wires the Reload button', () => {
    const onReload = vi.fn()
    const onDismiss = vi.fn()
    render(<UpdateToast onReload={onReload} onDismiss={onDismiss} />)
    expect(screen.getByText(/new version available/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /reload/i }))
    expect(onReload).toHaveBeenCalledTimes(1)
    expect(onDismiss).not.toHaveBeenCalled()
  })

  it('wires the Dismiss button', () => {
    const onReload = vi.fn()
    const onDismiss = vi.fn()
    render(<UpdateToast onReload={onReload} onDismiss={onDismiss} />)
    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }))
    expect(onDismiss).toHaveBeenCalledTimes(1)
    expect(onReload).not.toHaveBeenCalled()
  })
})
