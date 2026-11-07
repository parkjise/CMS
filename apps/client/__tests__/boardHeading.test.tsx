import { expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import type { BoardType, PublicBoard } from '@cms/types'
import type { BoardPage } from '@/lib/boardRoute'
import { CustomBoardList } from '@/templates/hospital-a/components/board/CustomBoardViews'
import { NoticeListView } from '@/templates/hospital-a/components/board/NoticeBoard'
import { ThemeBoardListView } from '@/components/board/ThemeBoard'

const board: PublicBoard = {
  id: 'b1',
  name: '사업체 소식',
  slug: 'news',
  description: '새 소식을 전합니다.',
  board_type: 'LIST',
}
const page: BoardPage = {
  posts: [{ id: 'p1', title: '새 안내', published_at: '2026-11-07T00:00:00Z', is_pinned: false }],
  total: 1,
  page: 1,
  totalPages: 1,
  keyword: '',
}
const hrefFor = (extra?: { id?: string }) => `/demo/b/news${extra?.id ? `/${extra.id}` : ''}`
const searchTarget = { action: '/demo/b/news', hidden: [] as [string, string][] }

for (const type of ['LIST', 'GALLERY', 'FAQ', 'CARD'] as BoardType[]) {
  it(`코드형 ${type}은 반복 제목을 숨겨도 목록 이름과 설명/검색을 유지한다`, () => {
    render(
      <CustomBoardList
        board={{ ...board, board_type: type }}
        list={page}
        hrefFor={hrefFor}
        searchTarget={searchTarget}
      />
    )
    const region = screen.getByRole('region', { name: board.name })
    const heading = within(region).getByRole('heading', { name: board.name, level: 2 })
    expect(heading).toHaveClass('sr-only')
    expect(heading).not.toHaveClass('board-list__title')
    expect(heading).not.toHaveAttribute('aria-hidden', 'true')
    expect(region).toHaveAttribute('aria-labelledby', heading.id)
    expect(within(region).getByText(board.description)).toHaveClass('board-list__desc')
    expect(within(region).getByLabelText(`${board.name} 검색`)).toBeInTheDocument()
    expect(within(region).getByText('새 안내')).toBeInTheDocument()
  })
}

it('빈 코드형 게시판도 접근성 이름과 빈 안내를 유지한다', () => {
  render(
    <CustomBoardList
      board={{ ...board, description: '' }}
      list={{ ...page, posts: [], total: 0 }}
      hrefFor={hrefFor}
      searchTarget={searchTarget}
    />
  )
  expect(screen.getByRole('region', { name: board.name })).toBeInTheDocument()
  expect(screen.getByText('등록된 글이 없습니다.')).toBeInTheDocument()
})

it('기본 공지 목록은 기존 제목 표시를 유지한다', () => {
  render(
    <NoticeListView
      title="공지사항"
      items={[]}
      total={0}
      page={1}
      totalPages={1}
      keyword=""
      hrefFor={hrefFor}
      searchTarget={searchTarget}
      canWrite={false}
    />
  )
  const heading = screen.getByRole('heading', { name: '공지사항', level: 2 })
  expect(heading).toHaveClass('board-list__title')
  expect(heading).not.toHaveClass('sr-only')
})

it('테마형은 목록의 유일한 제목을 계속 표시한다', () => {
  render(
    <ThemeBoardListView
      board={board}
      list={page}
      hrefFor={hrefFor}
      searchAction={searchTarget.action}
    />
  )
  const heading = screen.getByRole('heading', { name: board.name, level: 1 })
  expect(heading).not.toHaveClass('sr-only')
  expect(screen.getAllByRole('heading', { name: board.name })).toHaveLength(1)
})
