import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { useCopySuggest } from '@/hooks/useCopySuggest'

const postMock = vi.fn()

vi.mock('@/lib/api', () => ({
  authApi: {
    post: (...args: unknown[]) => postMock(...args),
  },
}))

const PARAMS = {
  section_type: 'HERO_BANNER',
  field: 'main_title',
  current_value: '기존 문구',
}

describe('useCopySuggest', () => {
  beforeEach(() => {
    postMock.mockReset()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('초기 상태는 비어있다', () => {
    const { result } = renderHook(() => useCopySuggest())
    expect(result.current.suggestions).toEqual([])
    expect(result.current.isLoading).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('성공 시 suggestions를 채우고 기본 tone/count를 전송한다', async () => {
    postMock.mockResolvedValue({
      data: { data: { suggestions: ['가', '나', '다'], tokens_used: 10 } },
    })
    const { result } = renderHook(() => useCopySuggest())

    await act(async () => {
      await result.current.generate(PARAMS)
    })

    expect(result.current.suggestions).toEqual(['가', '나', '다'])
    expect(result.current.error).toBeNull()
    expect(postMock).toHaveBeenCalledWith('/ai/suggest-copy', {
      tone: 'professional',
      count: 3,
      ...PARAMS,
    })
  })

  it('422 응답 시 한도 초과 메시지를 노출한다', async () => {
    postMock.mockRejectedValue({ response: { status: 422 } })
    const { result } = renderHook(() => useCopySuggest())

    await act(async () => {
      await result.current.generate(PARAMS)
    })

    expect(result.current.error).toContain('한도를 초과')
    expect(result.current.suggestions).toEqual([])
  })

  it('일반 오류 시 재시도 안내 메시지를 노출한다', async () => {
    postMock.mockRejectedValue(new Error('network'))
    const { result } = renderHook(() => useCopySuggest())

    await act(async () => {
      await result.current.generate(PARAMS)
    })

    expect(result.current.error).toContain('다시 시도')
  })

  it('reset은 상태를 초기화한다', async () => {
    postMock.mockResolvedValue({
      data: { data: { suggestions: ['가'], tokens_used: 1 } },
    })
    const { result } = renderHook(() => useCopySuggest())

    await act(async () => {
      await result.current.generate(PARAMS)
    })
    expect(result.current.suggestions).toHaveLength(1)

    act(() => result.current.reset())
    await waitFor(() => expect(result.current.suggestions).toEqual([]))
  })
})
