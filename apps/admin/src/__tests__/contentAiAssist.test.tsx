import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithQuery } from './renderWithQuery'
import type { BodyNode } from '@cms/types'
import { ContentPolishAssist, ContentTagAssist } from '@/components/ai/ContentAiAssist'
import { bodyToText } from '@/lib/richBody'
import { useAuthStore } from '@/stores/authStore'
import { useFeatureStore } from '@/stores/featureStore'

// 콘텐츠 문장 다듬기 · 태그 추천 (T-259, 콘텐츠 관리 기획서 CM-02 · CM-05)

const { post } = vi.hoisted(() => ({ post: vi.fn() }))
vi.mock('@/lib/api', () => ({ api: { post } }))

const BODY = [
  {
    type: 'paragraph',
    content: [
      { type: 'text', text: '지하 ' },
      { type: 'text', text: '주차장', marks: [{ type: 'bold' }] },
    ],
  },
  {
    type: 'bulletList',
    content: [
      { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: '2시간 무료' }] }] },
    ],
  },
] as unknown as BodyNode[]

const usage = { used: 1, limit: 20, remaining: 19 }

beforeEach(() => {
  post.mockReset()
  useAuthStore.setState({ user: { role: 'TENANT_ADMIN' } } as never)
  useFeatureStore.setState({ loaded: true, flags: { AI_SITE_ASSIST: true } } as never)
})
afterEach(() => useFeatureStore.getState().reset())

describe('bodyToText', () => {
  it('문단 · 목록 글자만 빈 줄로 나눈다', () => {
    expect(bodyToText(BODY)).toBe('지하 주차장\n\n2시간 무료')
    expect(bodyToText([{ type: 'p', text: '**굵게** 예전 글' }] as unknown as BodyNode[])).toBe(
      '굵게 예전 글'
    )
    expect(bodyToText(BODY, 4)).toBe('지하 주')
  })
})

describe('ContentPolishAssist', () => {
  it('스위치가 꺼져 있으면 버튼이 없다', () => {
    useFeatureStore.setState({ loaded: true, flags: {} } as never)
    renderWithQuery(
      <ContentPolishAssist typeId="t1" title="x" summary="y" body={[]} onApply={vi.fn()} />
    )
    expect(screen.queryByRole('button', { name: '문장 다듬기' })).not.toBeInTheDocument()
  })

  it('제목과 요약 · 본문이 없으면 누를 수 없다', () => {
    renderWithQuery(
      <ContentPolishAssist typeId="t1" title="주차" summary="" body={[]} onApply={vi.fn()} />
    )
    expect(screen.getByRole('button', { name: '문장 다듬기' })).toBeDisabled()
  })

  it('편집 중인 값을 보내고 고른 것만 채운다', async () => {
    const user = userEvent.setup()
    const onApply = vi.fn()
    post.mockResolvedValue({
      data: {
        data: {
          result: {
            summary: '다듬은 요약',
            body: [{ type: 'p', text: '다듬은 문단' }],
          },
          usage,
        },
      },
    })
    renderWithQuery(
      <ContentPolishAssist typeId="t1" title="주차 안내" summary="요약" body={BODY} onApply={onApply} />
    )
    await user.click(screen.getByRole('button', { name: '문장 다듬기' }))
    await user.click(screen.getByRole('radio', { name: '친근함' }))
    await user.click(screen.getByRole('button', { name: '다듬기' }))
    expect(post).toHaveBeenCalledWith('/v1/ai/assist/content_polish', {
      tone: 'friendly',
      content_type_id: 't1',
      title: '주차 안내',
      summary: '요약',
      text: '지하 주차장\n\n2시간 무료',
    })
    const body = await screen.findByRole('region', { name: '다듬은 본문' })
    await user.click(within(body).getByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: '고른 것 채우기' }))
    expect(onApply).toHaveBeenCalledWith({ summary: '다듬은 요약' })
  })
})

describe('ContentTagAssist', () => {
  it('있는 태그를 미리 고르고, 고른 것만 더한다', async () => {
    const user = userEvent.setup()
    const onApply = vi.fn()
    post.mockResolvedValue({
      data: {
        data: {
          result: {
            tags: [
              { name: '주차', existing: true },
              { name: '이용 안내', existing: false },
            ],
          },
          usage,
        },
      },
    })
    renderWithQuery(
      <ContentTagAssist
        typeId="t1"
        title="주차 되나요?"
        summary=""
        body={[]}
        tags={['예약']}
        onApply={onApply}
      />
    )
    await user.click(screen.getByRole('button', { name: '태그 추천' }))
    await user.click(screen.getByRole('button', { name: '추천받기' }))
    expect(post.mock.calls[0][1]).toMatchObject({ content_type_id: 't1', tags: ['예약'] })
    const list = await screen.findByRole('list', { name: '추천 태그' })
    expect(within(list).getByRole('checkbox', { name: /주차/ })).toBeChecked()
    expect(within(list).getByRole('checkbox', { name: /이용 안내/ })).not.toBeChecked()
    await user.click(within(list).getByRole('checkbox', { name: /이용 안내/ }))
    await user.click(screen.getByRole('button', { name: '고른 태그 더하기' }))
    await waitFor(() => expect(onApply).toHaveBeenCalledWith(['주차', '이용 안내']))
  })
})
