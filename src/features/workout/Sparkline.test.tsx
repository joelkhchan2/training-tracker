import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Sparkline } from './Sparkline'

describe('Sparkline', () => {
  it('renders an SVG polyline for 2+ values', () => {
    const { container } = render(<Sparkline values={[100, 110, 105, 120]} />)
    const polyline = container.querySelector('polyline')
    expect(polyline).toBeInTheDocument()
    expect(polyline).toHaveAttribute('points')
  })

  it('renders nothing for fewer than 2 values', () => {
    const { container: empty } = render(<Sparkline values={[]} />)
    expect(empty).toBeEmptyDOMElement()
    const { container: one } = render(<Sparkline values={[100]} />)
    expect(one).toBeEmptyDOMElement()
  })
})
