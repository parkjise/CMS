import { Sparkles } from 'lucide-react'
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AiUsageCard } from '@/components/billing/AiUsageCard'
import type { FeatureUsage } from '@/hooks/useAiUsage'

const renderCard = (usage: FeatureUsage, isLoading = false) =>
  render(
    <AiUsageCard
      icon={Sparkles}
      iconBg="bg-violet-50"
      label="이번 달 AI 문구 추천"
      usage={usage}
      isLoading={isLoading}
    />
  )

describe('AiUsageCard', () => {
  it('한도가 있는 플랜에서 사용량/한도를 표시한다', () => {
    renderCard({
      used: 3,
      limit: 20,
      remaining: 17,
      exceeded: false,
      supported: true,
    })
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('/ 20회')).toBeInTheDocument()
    expect(screen.getByText(/17회 남음/)).toBeInTheDocument()
  })

  it('한도 초과 시 배지와 안내 문구를 표시한다', () => {
    renderCard({
      used: 20,
      limit: 20,
      remaining: 0,
      exceeded: true,
      supported: true,
    })
    expect(screen.getByText('한도 초과')).toBeInTheDocument()
    expect(screen.getByText(/모두 사용했습니다/)).toBeInTheDocument()
  })

  it('무제한 플랜은 "무제한"으로 표시하고 한도 초과 배지를 숨긴다', () => {
    renderCard({
      used: 999,
      limit: null,
      remaining: null,
      exceeded: false,
      supported: true,
    })
    expect(screen.getByText('/ 무제한')).toBeInTheDocument()
    expect(screen.getByText('무제한 사용 가능')).toBeInTheDocument()
    expect(screen.queryByText('한도 초과')).not.toBeInTheDocument()
  })

  it('미지원 기능은 "미지원"으로 표시한다', () => {
    renderCard({
      used: 0,
      limit: 0,
      remaining: 0,
      exceeded: true,
      supported: false,
    })
    expect(screen.getByText('미지원')).toBeInTheDocument()
    expect(screen.getByText(/지원하지 않습니다/)).toBeInTheDocument()
    expect(screen.queryByText('한도 초과')).not.toBeInTheDocument()
  })

  it('로딩 중에는 스켈레톤만 표시한다', () => {
    renderCard(
      { used: 3, limit: 20, remaining: 17, exceeded: false, supported: true },
      true
    )
    expect(screen.queryByText('3')).not.toBeInTheDocument()
  })
})
