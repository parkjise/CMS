import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithQuery } from './renderWithQuery'
import { AiRecommendCard } from '@/components/templates/AiRecommendCard'
import type { TemplateItem } from '@/hooks/useTemplates'
import { api } from '@/lib/api'

// AI 템플릿 추천 (기획서 13.4, T-070-A)

const tpl = (id: string, name: string): TemplateItem =>
  ({
    id,
    template_type: 'HOSPITAL',
    name,
    description: '',
    thumbnail_url: '',
    css_variables: {},
    section_layouts: [],
    is_active: true,
    min_plan: 'BASIC',
    locked: false,
  }) as TemplateItem

const TEMPLATES = [tpl('t1', '웜 트러스트'), tpl('t2', '모던 미니멀'), tpl('t3', '클린 샵')]

const result = (source: 'ai' | 'rule', ids = ['t1', 't2', 't3']) => ({
  data: {
    success: true,
    data: {
      source,
      recommendations: ids.map((id) => ({
        template_id: id,
        name: TEMPLATES.find((t) => t.id === id)?.name ?? id,
        reason: `${id} 이유`,
      })),
    },
  },
})

beforeEach(() => vi.restoreAllMocks())

const renderCard = (props: Partial<Parameters<typeof AiRecommendCard>[0]> = {}) => {
  const onApply = vi.fn()
  const onPreview = vi.fn()
  renderWithQuery(
    <AiRecommendCard
      enabled
      templates={TEMPLATES}
      currentId={null}
      onApply={onApply}
      onPreview={onPreview}
      {...props}
    />
  )
  return { onApply, onPreview }
}

describe('AiRecommendCard', () => {
  it('추천 3개를 이유와 함께, 미리보기 · 적용은 그 템플릿으로', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue(result('ai'))
    const user = userEvent.setup()
    const { onApply, onPreview } = renderCard()
    expect(await screen.findByText('1. 웜 트러스트')).toBeInTheDocument()
    expect(screen.getByText('t2 이유')).toBeInTheDocument()
    expect(screen.getByText('AI 분석')).toBeInTheDocument()
    expect(post).toHaveBeenCalledWith('/v1/ai/recommend-templates', { refresh: false })

    await user.click(screen.getAllByRole('button', { name: '미리보기' })[0])
    expect(onPreview).toHaveBeenCalledWith(TEMPLATES[0])
    await user.click(screen.getAllByRole('button', { name: '적용' })[1])
    expect(onApply).toHaveBeenCalledWith(TEMPLATES[1])
  })

  it('기본 추천이면 그렇게 표시', async () => {
    vi.spyOn(api, 'post').mockResolvedValue(result('rule'))
    renderCard()
    expect(await screen.findByText('기본 추천 (업종 기준)')).toBeInTheDocument()
  })

  it('[다시 추천] 은 refresh=true 로 새로 받아 바꾼다', async () => {
    const post = vi
      .spyOn(api, 'post')
      .mockResolvedValueOnce(result('ai', ['t1']))
      .mockResolvedValueOnce(result('ai', ['t3']))
    const user = userEvent.setup()
    renderCard()
    expect(await screen.findByText('1. 웜 트러스트')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /다시 추천/ }))
    expect(await screen.findByText('1. 클린 샵')).toBeInTheDocument()
    expect(post).toHaveBeenLastCalledWith('/v1/ai/recommend-templates', { refresh: true })
  })

  it('지금 쓰는 템플릿은 추천 목록에서 뺀다', async () => {
    vi.spyOn(api, 'post').mockResolvedValue(result('ai'))
    renderCard({ currentId: 't1' })
    expect(await screen.findByText('1. 모던 미니멀')).toBeInTheDocument()
    expect(screen.queryByText(/웜 트러스트/)).toBeNull()
  })

  it('기능이 꺼져 있으면 요청하지 않고 안내만', () => {
    const post = vi.spyOn(api, 'post')
    renderCard({ enabled: false })
    expect(screen.getByText(/STANDARD 이상 요금제/)).toBeInTheDocument()
    expect(post).not.toHaveBeenCalled()
  })

  it('실패하면 안내', async () => {
    vi.spyOn(api, 'post').mockRejectedValue(new Error('x'))
    renderCard()
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/추천을 불러오지 못했습니다|요청/)
    )
  })
})
