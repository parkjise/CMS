import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { SslExpiringWidget } from '@/components/dashboard/SslExpiringWidget'

function renderWidget(domains: Parameters<typeof SslExpiringWidget>[0]['domains']) {
  return render(
    <MemoryRouter>
      <SslExpiringWidget domains={domains} />
    </MemoryRouter>,
  )
}

describe('SslExpiringWidget (T-105)', () => {
  it('만료 예정 도메인이 없으면 렌더하지 않음', () => {
    const { container } = renderWidget([])
    expect(container).toBeEmptyDOMElement()
  })

  it('도메인과 남은 일수를 표시', () => {
    renderWidget([
      { domain: 'www.a.com', ssl_expires_at: '2026-07-17', days_left: 7 },
      { domain: 'www.b.com', ssl_expires_at: '2026-07-25', days_left: 15 },
    ])
    expect(screen.getByText(/SSL 만료 예정 도메인 \(2\)/)).toBeInTheDocument()
    expect(screen.getByText('www.a.com')).toBeInTheDocument()
    expect(screen.getByText('D-7')).toBeInTheDocument()
  })
})
