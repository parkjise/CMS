import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// recharts는 jsdom에서 레이아웃 측정이 불가하므로 stub 처리.
// (차트 내부가 아니라 라벨·퍼센트·토글 로직을 검증한다)
vi.mock('recharts', () => {
  const Stub = ({ children }: { children?: ReactNode }) => <div>{children}</div>
  return {
    ResponsiveContainer: Stub,
    PieChart: Stub,
    Pie: Stub,
    Cell: Stub,
    Tooltip: Stub,
    LineChart: Stub,
    Line: Stub,
    CartesianGrid: Stub,
    XAxis: Stub,
    YAxis: Stub,
    Legend: Stub,
  }
})
import { TopReferrers } from '@/components/analytics/TopReferrers'
import { MobileRatioDonut } from '@/components/analytics/MobileRatioDonut'
import { VisitorTrendChart } from '@/components/analytics/VisitorTrendChart'

describe('TopReferrers', () => {
  it('유입 경로를 한국어 라벨과 퍼센트로 표시한다', () => {
    render(
      <TopReferrers
        isLoading={false}
        data={[
          { source: 'naver', count: 75 },
          { source: 'direct', count: 25 },
        ]}
      />,
    )
    expect(screen.getByText('네이버')).toBeInTheDocument()
    expect(screen.getByText('직접 유입')).toBeInTheDocument()
    expect(screen.getByText(/75 \(75%\)/)).toBeInTheDocument()
  })

  it('데이터가 없으면 안내 문구를 표시한다', () => {
    render(<TopReferrers isLoading={false} data={[]} />)
    expect(screen.getByText(/유입 경로 데이터가 없습니다/)).toBeInTheDocument()
  })
})

describe('MobileRatioDonut', () => {
  it('모바일 비율 퍼센트를 계산해 표시한다', () => {
    render(
      <MobileRatioDonut
        isLoading={false}
        data={{ mobile: 30, desktop: 70, total: 100 }}
      />,
    )
    expect(screen.getByText('30%')).toBeInTheDocument()
  })

  it('데이터가 없으면 안내 문구를 표시한다', () => {
    render(
      <MobileRatioDonut
        isLoading={false}
        data={{ mobile: 0, desktop: 0, total: 0 }}
      />,
    )
    expect(screen.getByText('데이터가 없습니다.')).toBeInTheDocument()
  })
})

describe('VisitorTrendChart 기간 토글', () => {
  it('플랜 한도를 넘는 기간 버튼은 비활성화된다', () => {
    render(
      <VisitorTrendChart
        data={[]}
        isLoading={false}
        range={7}
        maxDays={7}
        onRangeChange={vi.fn()}
      />,
    )
    // BASIC(maxDays 7): 30일/90일 비활성
    expect(screen.getByRole('button', { name: '30일' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '90일' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '7일' })).not.toBeDisabled()
  })

  it('허용된 기간 버튼 클릭 시 onRangeChange 호출', async () => {
    const user = userEvent.setup()
    const onRangeChange = vi.fn()
    render(
      <VisitorTrendChart
        data={[]}
        isLoading={false}
        range={7}
        maxDays={90}
        onRangeChange={onRangeChange}
      />,
    )
    await user.click(screen.getByRole('button', { name: '30일' }))
    expect(onRangeChange).toHaveBeenCalledWith(30)
  })
})
