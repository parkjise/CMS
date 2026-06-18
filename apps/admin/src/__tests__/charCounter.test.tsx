import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CharCounter } from '@/components/content/forms/CharCounter'

describe('CharCounter', () => {
  it('현재/최대를 표시한다', () => {
    render(<CharCounter current={12} max={40} />)
    expect(screen.getByText('12/40')).toBeInTheDocument()
  })

  it('한도 이하에서는 평범한 회색 텍스트', () => {
    render(<CharCounter current={10} max={40} />)
    const el = screen.getByText('10/40')
    expect(el.className).toMatch(/text-slate-400/)
  })

  it('한도 초과 시 빨간색 강조', () => {
    render(<CharCounter current={42} max={40} />)
    const el = screen.getByText('42/40')
    expect(el.className).toMatch(/text-rose-600/)
  })
})
