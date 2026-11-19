import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { BoardType, PublicBoard } from '@cms/types'
import { CustomBoardList } from '@/templates/hospital-a/components/board/CustomBoardViews'
import { ThemeBoardListView } from '@/components/board/ThemeBoard'
import type { BoardPage } from '@/lib/boardRoute'

/** 게시판 디자인의 표시 옵션 (T-220) — 공지 배지 · 전체 글 수 · 검색창 · 페이지 번호 */
const board: PublicBoard = {
  id: 'b1',
  name: '소식',
  slug: 'news',
  board_type: 'LIST',
  description: '',
}
const list: BoardPage = {
  posts: [{ id: 'p1', title: '고정 글', published_at: '2026-11-07T00:00:00Z', is_pinned: true }],
  total: 25,
  page: 1,
  totalPages: 3,
  keyword: '',
}
const hrefFor = (x?: { id?: string; p?: number }) =>
  `/demo/b/news${x?.id ? `/${x.id}` : ''}${x?.p ? `?p=${x.p}` : ''}`
const OFF = {
  show_pin_badge: false,
  show_total: false,
  show_search: false,
  show_pagination: false,
}

const renderList = (mode: 'code' | 'theme', selected: PublicBoard) =>
  render(
    mode === 'code' ? (
      <CustomBoardList
        board={selected}
        list={list}
        hrefFor={hrefFor}
        searchTarget={{ action: '/demo/b/news', hidden: [] }}
      />
    ) : (
      <ThemeBoardListView
        board={selected}
        list={list}
        hrefFor={hrefFor}
        searchAction="/demo/b/news"
      />
    )
  )

for (const mode of ['code', 'theme'] as const) {
  describe(`${mode} 표시 옵션`, () => {
    it.each(['LIST', 'CARD', 'WEBZINE'] as BoardType[])('%s 기본은 모두 보인다', (boardType) => {
      renderList(mode, { ...board, board_type: boardType })
      expect(screen.getByText('공지')).toBeInTheDocument()
      expect(screen.getByText(/총/)).toHaveTextContent('25')
      expect(screen.getByRole('search')).toBeInTheDocument()
      expect(screen.getByRole('link', { name: '2' })).toBeInTheDocument()
    })

    it.each(['LIST', 'CARD', 'WEBZINE'] as BoardType[])('%s 끄면 숨긴다', (boardType) => {
      const design = { columns: 3, image_ratio: '4:3', ...OFF } as PublicBoard['design']
      renderList(mode, { ...board, board_type: boardType, design })
      expect(screen.getByRole('link', { name: /고정 글/ })).toBeInTheDocument()
      expect(screen.queryByText('공지')).not.toBeInTheDocument()
      expect(screen.queryByText(/총/)).not.toBeInTheDocument()
      expect(screen.queryByRole('search')).not.toBeInTheDocument()
      expect(screen.queryByRole('link', { name: '2' })).not.toBeInTheDocument()
    })
  })
}
