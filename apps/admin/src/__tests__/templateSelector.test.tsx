import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TemplateCard } from '@/components/templates/TemplateCard'
import { IndustryFilterTabs } from '@/components/templates/IndustryFilterTabs'
import { ApplyConfirmDialog } from '@/components/templates/ApplyConfirmDialog'
import type { TemplateItem } from '@/hooks/useTemplates'

const baseTemplate: TemplateItem = {
  id: 'tpl-1',
  template_type: 'HOSPITAL',
  name: '웜 트러스트',
  description: '신뢰감 있는 템플릿',
  thumbnail_url: '/templates/warm-trust.svg',
  css_variables: { primary: '#d97706' },
  section_layouts: ['HERO_BANNER'],
  is_active: true,
  min_plan: 'BASIC',
  locked: false,
}

describe('TemplateCard', () => {
  it('이름·추천 업종 태그를 표시하고 적용/미리보기 버튼이 동작한다', async () => {
    const user = userEvent.setup()
    const onApply = vi.fn()
    const onPreview = vi.fn()
    render(
      <TemplateCard
        template={baseTemplate}
        isCurrent={false}
        onApply={onApply}
        onPreview={onPreview}
      />,
    )
    expect(screen.getByText('웜 트러스트')).toBeInTheDocument()
    expect(screen.getByText('병원·의원')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /미리보기/ }))
    expect(onPreview).toHaveBeenCalledWith(baseTemplate)

    await user.click(screen.getByRole('button', { name: '적용하기' }))
    expect(onApply).toHaveBeenCalledWith(baseTemplate)
  })

  it('잠긴 템플릿은 잠금 표시와 함께 적용 버튼이 비활성화된다', () => {
    render(
      <TemplateCard
        template={{ ...baseTemplate, locked: true, min_plan: 'PREMIUM' }}
        isCurrent={false}
        onApply={vi.fn()}
        onPreview={vi.fn()}
      />,
    )
    expect(screen.getByText('PREMIUM 플랜 전용')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '적용하기' })).toBeDisabled()
  })

  it('현재 적용 중이면 "적용 중" 뱃지와 비활성 버튼을 표시한다', () => {
    render(
      <TemplateCard
        template={baseTemplate}
        isCurrent
        onApply={vi.fn()}
        onPreview={vi.fn()}
      />,
    )
    // 뱃지 + 버튼 두 곳에 "적용 중" 표기
    expect(screen.getAllByText('적용 중').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByRole('button', { name: '적용 중' })).toBeDisabled()
  })
})

describe('IndustryFilterTabs', () => {
  it('전체/업종 탭 클릭 시 onChange가 호출된다', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<IndustryFilterTabs value={null} onChange={onChange} />)

    await user.click(screen.getByRole('tab', { name: '펜션·숙박' }))
    expect(onChange).toHaveBeenCalledWith('PENSION')

    await user.click(screen.getByRole('tab', { name: '전체' }))
    expect(onChange).toHaveBeenCalledWith(null)
  })
})

describe('ApplyConfirmDialog', () => {
  it('콘텐츠 유지 안내를 보여주고 확인 시 onConfirm을 호출한다', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    render(
      <ApplyConfirmDialog
        template={baseTemplate}
        isApplying={false}
        onConfirm={onConfirm}
        onClose={vi.fn()}
      />,
    )
    expect(
      screen.getByText(/콘텐츠는 그대로 유지됩니다/),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '적용하기' }))
    expect(onConfirm).toHaveBeenCalled()
  })

  it('template이 null이면 다이얼로그를 렌더링하지 않는다', () => {
    render(
      <ApplyConfirmDialog
        template={null}
        isApplying={false}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    expect(screen.queryByText('이 템플릿을 적용할까요?')).not.toBeInTheDocument()
  })
})
