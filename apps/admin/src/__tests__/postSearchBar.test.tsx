import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PostSearchBar } from '@/components/boards/PostSearchBar'
import type { PostFilters } from '@/hooks/useBoards'

const renderBar = (filters: PostFilters = { page: 1, size: 20 }) => {
  const onChange = vi.fn()
  render(<PostSearchBar filters={filters} onChange={onChange} categories={[]} pageSize={20} />)
  return onChange
}

describe('글 관리 검색 — 상세보기 펼침 (T-214)', () => {
  it('처음엔 한 줄 — 둘째 줄은 닫혀 있고 버튼 4개가 오른쪽에 순서대로', () => {
    renderBar()
    expect(screen.queryByLabelText('작성자')).not.toBeInTheDocument()
    const form = screen.getByRole('form', { name: '글 검색' })
    const buttons = within(form)
      .getAllByRole('button')
      .map((b) => b.textContent?.trim())
    expect(buttons).toEqual(['상세보기', '초기화', '휴지통', '검색'])
    expect(screen.getByRole('button', { name: /상세보기/ })).toHaveAttribute('aria-expanded', 'false')
  })

  it('[상세보기] 로 둘째 줄을 펼치고, 넣은 조건 수를 버튼에 보인다', async () => {
    renderBar()
    await userEvent.click(screen.getByRole('button', { name: /상세보기/ }))
    expect(screen.getByRole('button', { name: /상세보기/ })).toHaveAttribute('aria-expanded', 'true')
    await userEvent.type(screen.getByLabelText('작성자'), '홍길동')
    await userEvent.type(screen.getByLabelText('본문 검색'), '주차')
    expect(screen.getByRole('button', { name: '상세보기 2' })).toBeInTheDocument()
    // 접어도 개수는 남는다
    await userEvent.click(screen.getByRole('button', { name: '상세보기 2' }))
    expect(screen.queryByLabelText('작성자')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '상세보기 2' })).toBeInTheDocument()
  })

  it('[검색] 은 제목 · 작성자 · 본문 · 작성일을 1쪽부터 보낸다', async () => {
    const onChange = renderBar({ page: 3, size: 20, status: 'PUBLISHED' })
    await userEvent.type(screen.getByLabelText('제목 검색'), '휴진')
    await userEvent.click(screen.getByRole('button', { name: /상세보기/ }))
    await userEvent.type(screen.getByLabelText('작성자'), '홍길동')
    await userEvent.type(screen.getByLabelText('작성일 시작'), '2026-11-01')
    await userEvent.type(screen.getByLabelText('작성일 끝'), '2026-11-02')
    await userEvent.click(screen.getByRole('button', { name: '검색' }))
    const sent = onChange.mock.lastCall![0] as PostFilters
    expect(sent).toMatchObject({ page: 1, status: 'PUBLISHED', q: '휴진', author: '홍길동' })
    expect(sent.created_from).toBeTruthy()
    expect(new Date(sent.created_before!) > new Date(sent.created_from!)).toBe(true)
  })

  it('[초기화] 는 모든 조건을 비운다', async () => {
    const onChange = renderBar({ page: 2, size: 20, q: '휴진', trash: true })
    await userEvent.click(screen.getByRole('button', { name: '초기화' }))
    expect(onChange).toHaveBeenLastCalledWith({ page: 1, size: 20 })
    expect(screen.getByLabelText('제목 검색')).toHaveValue('')
  })

  it('[휴지통] 은 토글 — 켜면 상태 선택을 잠그고, 다시 누르면 끈다', async () => {
    const onChange = renderBar({ page: 1, size: 20, trash: true })
    expect(screen.getByRole('button', { name: '휴지통' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText('상태')).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: '휴지통' }))
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ trash: undefined, page: 1 }),
    )
  })
})
