import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithQuery } from './renderWithQuery'
import { AiFillAssist } from '@/components/ai/AiFillAssist'
import { AI_SITE_ASSIST, isAiPreview } from '@/lib/aiAssist'
import { useAuthStore } from '@/stores/authStore'
import { useFeatureStore } from '@/stores/featureStore'

// AI 보조 화면 (관리자 화면 개선 · AI 보조 기획서 2장, T-231-A) — 서버는 T-231-B

const { post } = vi.hoisted(() => ({ post: vi.fn() }))
vi.mock('@/lib/api', () => ({ api: { post, get: vi.fn() } }))

const RESULT = {
  meta_title: '바른치과 | 강남 임플란트',
  meta_description: '강남역 앞 치과, 개원 2010년',
  keywords: ['강남 치과', '임플란트'],
}

function Harness() {
  const [title, setTitle] = useState('지금 제목')
  const [description, setDescription] = useState('')
  const [keywords, setKeywords] = useState<string[]>([])
  return (
    <>
      <AiFillAssist
        kind="seo"
        flag={AI_SITE_ASSIST}
        buttonLabel="사이트 정보로 채우기"
        title="SEO 문구 추천"
        fields={[
          { key: 'meta_title', label: '메타 제목', current: title },
          { key: 'meta_description', label: '메타 설명', current: description },
          { key: 'keywords', label: '대표 키워드', current: keywords },
        ]}
        onApply={(values) => {
          if (values.meta_title !== undefined) setTitle(values.meta_title)
          if (values.meta_description !== undefined) setDescription(values.meta_description)
          if (values.keywords !== undefined) setKeywords(values.keywords)
        }}
      />
      <output data-testid="form">{[title, description, keywords.join('|')].join(' / ')}</output>
    </>
  )
}

const flagOn = (on: boolean) =>
  useFeatureStore.setState({ loaded: true, flags: on ? { [AI_SITE_ASSIST]: true } : {} })
const button = () => screen.queryByRole('button', { name: '사이트 정보로 채우기' })

beforeEach(() => {
  vi.clearAllMocks()
  window.sessionStorage.clear()
  useAuthStore.setState({ user: { role: 'TENANT_ADMIN' } } as never)
  flagOn(true)
})

afterEach(() => useFeatureStore.getState().reset())

describe('AI 로 채우기 버튼 (T-231-A)', () => {
  it('기능 스위치가 꺼져 있으면(지금 모든 사업체) 버튼이 없다', () => {
    flagOn(false)
    renderWithQuery(<Harness />)
    expect(button()).not.toBeInTheDocument()
  })

  it('보기 전용 계정에는 버튼이 없다', () => {
    useAuthStore.setState({ user: { role: 'TENANT_VIEWER' } } as never)
    renderWithQuery(<Harness />)
    expect(button()).not.toBeInTheDocument()
  })

  it('말투를 골라 만들고, 빈 칸만 처음 골라 둔 뒤 적용하면 폼에 채운다', async () => {
    post.mockResolvedValue({
      data: { data: { result: RESULT, usage: { used: 4, limit: 20, remaining: 16 } } },
    })
    const user = userEvent.setup()
    renderWithQuery(<Harness />)
    await user.click(button()!)
    const drawer = screen.getByRole('dialog', { name: 'SEO 문구 추천' })
    expect(within(drawer).getByRole('note')).toHaveTextContent('AI 가 만든 초안이에요')
    await user.click(within(drawer).getByRole('radio', { name: '친근함' }))
    await user.click(within(drawer).getByRole('button', { name: '만들기' }))
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/v1/ai/assist/seo', { tone: 'friendly' })
    )

    const results = await within(drawer).findByRole('list', { name: 'AI 결과' })
    // 지금 값이 있는 메타 제목은 덮어쓰지 않게 처음엔 고르지 않는다
    expect(within(results).getByRole('checkbox', { name: /메타 제목/ })).not.toBeChecked()
    expect(within(results).getByRole('checkbox', { name: /메타 설명/ })).toBeChecked()
    expect(within(results).getByText('지금: 지금 제목')).toBeInTheDocument()
    // 숫자가 있으면 확인 안내
    expect(within(results).getByText('숫자가 사실인지 확인해 주세요.')).toBeInTheDocument()
    expect(within(drawer).getByText('이번 달 AI 사용 4 / 20회 · 16회 남음')).toBeInTheDocument()

    await user.click(within(drawer).getByRole('button', { name: '고른 2개 적용' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByTestId('form')).toHaveTextContent(
      '지금 제목 / 강남역 앞 치과, 개원 2010년 / 강남 치과|임플란트'
    )
    // 다시 열면 새로 시작 — 지난 결과 없이 [만들기]부터
    await user.click(button()!)
    expect(screen.queryByRole('list', { name: 'AI 결과' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '만들기' })).toBeInTheDocument()
  })

  it('실패하면 안내하고, 한도를 넘으면 그 까닭을', async () => {
    post.mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 422,
        data: {
          error: { code: 'PLAN_LIMIT_EXCEEDED', message: '이번 달 AI 사용 한도를 넘었어요.' },
        },
      },
    })
    const user = userEvent.setup()
    renderWithQuery(<Harness />)
    await user.click(button()!)
    await user.click(screen.getByRole('button', { name: '만들기' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('이번 달 AI 사용 한도를 넘었어요.')
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('개발 미리보기 모드 (T-231-A)', () => {
  it('?ai-preview 로 켜면 스위치 없이 버튼이 보이고, 서버 대신 예시 결과', async () => {
    flagOn(false)
    window.history.replaceState(null, '', '/admin/site/seo?ai-preview')
    expect(isAiPreview()).toBe(true)
    window.history.replaceState(null, '', '/admin/site/seo')
    // 한 번 켜면 이 탭에서는 계속
    expect(isAiPreview()).toBe(true)

    const user = userEvent.setup()
    renderWithQuery(<Harness />)
    await user.click(button()!)
    await user.click(screen.getByRole('button', { name: '만들기' }))
    expect(await screen.findByRole('list', { name: 'AI 결과' })).toHaveTextContent('바른치과의원')
    expect(post).not.toHaveBeenCalled()
  })
})
