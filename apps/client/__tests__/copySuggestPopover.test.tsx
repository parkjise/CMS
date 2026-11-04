import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { CopySuggestPopover, popoverShift } from '@/components/ai/CopySuggestPopover'

const postMock = vi.fn()

vi.mock('@/lib/api', () => ({
  authApi: {
    post: (...args: unknown[]) => postMock(...args),
  },
}))

const onApply = vi.fn()

/** data-section-type 컨텍스트 안에서 팝오버를 렌더 */
const renderPopover = () =>
  render(
    <section data-section-type="HERO_BANNER">
      <CopySuggestPopover
        sectionId="sec-1"
        field="main_title"
        currentValue="기존 문구"
        onApply={onApply}
      />
    </section>,
  )

const okResponse = (suggestions: string[]) => ({
  data: { data: { suggestions, tokens_used: 10 } },
})

describe('CopySuggestPopover', () => {
  beforeEach(() => {
    postMock.mockReset()
    onApply.mockReset()
  })

  afterEach(() => {
    cleanup()
  })

  // T-125-H — 버튼이 글자 옆으로 오면서 추천 창이 화면 왼쪽으로 잘릴 수 있다
  it.each([
    ['왼쪽 공간이 넉넉하면 그대로', 800, 1440, 0],
    ['왼쪽이 모자라면 오른쪽으로', 100, 1440, -196],
    ['휴대폰 화면 가운데', 200, 390, -96],
    ['화면보다 좁은 창', 300, 280, 28],
  ])('popoverShift: %s', (_name, anchorRight, viewport, expected) => {
    expect(popoverShift(anchorRight, viewport)).toBe(expected)
  })

  it('열 때 화면에 맞는 위치를 정한다', async () => {
    postMock.mockResolvedValue(okResponse(['추천 1']))
    renderPopover()
    const button = screen.getByRole('button', { name: 'AI 문구 추천' })
    fireEvent.click(button)
    expect(button.parentElement!.style.getPropertyValue('--popover-shift')).toMatch(/px$/)
    await waitFor(() => expect(screen.getByText('추천 1')).toBeInTheDocument())
  })

  it('AI 추천 버튼을 노출한다', () => {
    renderPopover()
    expect(screen.getByRole('button', { name: 'AI 문구 추천' })).toBeInTheDocument()
  })

  it('열면 자동 생성하여 추천 문구를 표시한다', async () => {
    postMock.mockResolvedValue(okResponse(['추천 1', '추천 2', '추천 3']))
    renderPopover()

    fireEvent.click(screen.getByRole('button', { name: 'AI 문구 추천' }))

    await waitFor(() => expect(screen.getByText('추천 1')).toBeInTheDocument())
    expect(screen.getByText('추천 2')).toBeInTheDocument()
    // DOM에서 section_type을 해석해 전송
    expect(postMock).toHaveBeenCalledWith(
      '/ai/suggest-copy',
      expect.objectContaining({
        section_type: 'HERO_BANNER',
        field: 'main_title',
        current_value: '기존 문구',
      }),
    )
  })

  it('추천 문구 적용 시 onApply 호출 후 닫힌다', async () => {
    postMock.mockResolvedValue(okResponse(['적용할 문구']))
    renderPopover()

    fireEvent.click(screen.getByRole('button', { name: 'AI 문구 추천' }))
    await waitFor(() => expect(screen.getByText('적용할 문구')).toBeInTheDocument())

    fireEvent.click(screen.getByText('적용할 문구'))
    expect(onApply).toHaveBeenCalledWith('적용할 문구')
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).toBeNull(),
    )
  })

  it('다시 생성 버튼은 API를 재호출한다', async () => {
    postMock.mockResolvedValue(okResponse(['문구']))
    renderPopover()

    fireEvent.click(screen.getByRole('button', { name: 'AI 문구 추천' }))
    await waitFor(() => expect(screen.getByText('문구')).toBeInTheDocument())
    expect(postMock).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: /다시 생성/ }))
    await waitFor(() => expect(postMock).toHaveBeenCalledTimes(2))
  })

  it('422 오류 시 한도 초과 메시지와 다시 시도 버튼을 노출한다', async () => {
    postMock.mockRejectedValue({ response: { status: 422 } })
    renderPopover()

    fireEvent.click(screen.getByRole('button', { name: 'AI 문구 추천' }))

    await waitFor(() =>
      expect(screen.getByText(/한도를 초과/)).toBeInTheDocument(),
    )
    expect(screen.getByRole('button', { name: /다시 시도/ })).toBeInTheDocument()
  })
})
