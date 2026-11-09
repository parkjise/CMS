import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { BoardType, PublicBoard, PublicFieldValue } from '@cms/types'
import { CustomBoardList } from '@/templates/hospital-a/components/board/CustomBoardViews'
import { ThemeBoardListView } from '@/components/board/ThemeBoard'
import { loadBoardPage, type BoardPage } from '@/lib/boardRoute'

const fields: PublicFieldValue[] = [
  { key: 'team', label: '부서', field_type: 'SELECT', value: '개발팀' },
  { key: 'count', label: '인원', field_type: 'NUMBER', value: 0 },
  { key: 'open', label: '접수', field_type: 'BOOLEAN', value: false },
  { key: 'photo', label: '사진', field_type: 'IMAGE', value: 'https://example.test/photo.jpg' },
  { key: 'url', label: '지원', field_type: 'URL', value: 'https://example.test/jobs' },
]
const board: PublicBoard = {
  id: 'b1',
  name: '채용',
  slug: 'jobs',
  board_type: 'LIST',
  description: '',
}
const page = (extra = {}): BoardPage => ({
  posts: [
    {
      id: 'p1',
      title: '신입 모집',
      published_at: '2026-11-07T00:00:00Z',
      is_pinned: true,
      list_fields: fields,
      ...extra,
    },
  ],
  total: 1,
  page: 1,
  totalPages: 1,
  keyword: '',
  category: undefined,
})
const hrefFor = (x?: { id?: string }) => `/demo/b/jobs${x?.id ? `/${x.id}` : ''}`

for (const mode of ['code', 'theme']) {
  for (const boardType of ['LIST', 'GALLERY', 'FAQ'] as BoardType[]) {
    const renderList = (list: BoardPage, selectedBoard = { ...board, board_type: boardType }) =>
      render(
        mode === 'code' ? (
          <CustomBoardList
            board={selectedBoard}
            list={list}
            hrefFor={hrefFor}
            searchTarget={{ action: '/demo/b/jobs', hidden: [] }}
          />
        ) : (
          <ThemeBoardListView
            board={selectedBoard}
            list={list}
            hrefFor={hrefFor}
            searchAction="/demo/b/jobs"
          />
        )
      )
    describe(`${mode} ${boardType} 추가 정보`, () => {
      it('필드 이름과 0 · 아니오를 표시하며 사진/링크를 중첩하지 않는다', () => {
        renderList(page())
        for (const text of [
          '부서: 개발팀',
          '인원: 0',
          '접수: 아니오',
          '사진: 사진 있음',
          '지원: https://example.test/jobs',
        ])
          expect(screen.getByText(text)).toBeInTheDocument()
        expect(screen.queryByRole('img')).not.toBeInTheDocument()
        expect(
          screen.queryByRole('link', { name: 'https://example.test/jobs' })
        ).not.toBeInTheDocument()
        if (boardType === 'FAQ') {
          expect(screen.getByText('신입 모집').closest('summary')).toContainElement(
            screen.getByText('부서: 개발팀')
          )
        } else {
          expect(screen.getByRole('link', { name: /신입 모집/ })).toHaveAttribute(
            'href',
            '/demo/b/jobs/p1'
          )
        }
      })
      it('비밀글의 칸은 값이 전달되어도 숨긴다', () => {
        renderList(page({ is_secret: true }))
        expect(screen.queryByText('부서: 개발팀')).not.toBeInTheDocument()
        expect(screen.getByText('신입 모집')).toBeInTheDocument()
      })
      it('이전 응답에 필드가 없으면 기존 글과 작성일을 표시한다', () => {
        renderList(page({ list_fields: undefined }))
        expect(screen.getByText('신입 모집')).toBeInTheDocument()
        if (boardType !== 'FAQ')
          expect(document.querySelector('time')).toHaveAttribute('dateTime', '2026-11-07')
        expect(screen.queryByText('부서: 개발팀')).not.toBeInTheDocument()
      })
    })
  }
}

const tableColumns = fields.map(({ key, label, field_type }) => ({ key, label, field_type }))
for (const mode of ['code', 'theme']) {
  const tableBoard: PublicBoard = {
    ...board,
    design: {
      columns: 3,
      image_ratio: '4:3',
      show_date: true,
      show_image: true,
      show_summary: true,
      faq_single_open: false,
      faq_first_open: false,
      list_layout: 'columns',
    },
  }
  const renderTable = (list: BoardPage, selected = tableBoard) =>
    render(
      mode === 'code' ? (
        <CustomBoardList
          board={selected}
          list={list}
          hrefFor={hrefFor}
          searchTarget={{ action: '/demo/b/jobs', hidden: [] }}
        />
      ) : (
        <ThemeBoardListView
          board={selected}
          list={list}
          hrefFor={hrefFor}
          searchAction="/demo/b/jobs"
        />
      )
    )
  describe(`${mode} 공개 추가 정보 표`, () => {
    it('서버 열 정의 순서대로 헤더/값을 표시하고 글 링크·고정·날짜와 0/아니오를 유지한다', () => {
      renderTable({ ...page(), list_columns: tableColumns })
      expect(screen.getAllByRole('columnheader').map((el) => el.textContent)).toEqual([
        '제목',
        '부서',
        '인원',
        '접수',
        '사진',
        '지원',
        '작성일',
      ])
      for (const value of ['개발팀', '0', '아니오', '사진 있음', 'https://example.test/jobs'])
        expect(screen.getByRole('cell', { name: value })).toBeInTheDocument()
      expect(screen.getByRole('link', { name: /신입 모집/ })).toHaveAttribute(
        'href',
        '/demo/b/jobs/p1'
      )
      expect(screen.getByText('공지')).toBeInTheDocument()
      expect(screen.getByRole('region', { name: '게시글 표' })).toHaveAttribute('tabindex', '0')
      expect(screen.queryByRole('img')).not.toBeInTheDocument()
      expect(
        screen.queryByRole('link', { name: 'https://example.test/jobs' })
      ).not.toBeInTheDocument()
    })
    it('저장된 열 순서와 최소 크기를 헤더와 값에 함께 적용한다', () => {
      renderTable({
        ...page(),
        list_columns: [
          { ...tableColumns[1], size: 'narrow' },
          { ...tableColumns[0], size: 'wide' },
          tableColumns[2],
        ],
      })
      expect(screen.getAllByRole('columnheader').map((el) => el.textContent)).toEqual([
        '제목',
        '인원',
        '부서',
        '접수',
        '작성일',
      ])
      const prefix = mode === 'code' ? 'board-list__table-' : 'min-w-'
      expect(screen.getByRole('columnheader', { name: '인원' })).toHaveClass(
        prefix + (mode === 'code' ? 'narrow' : '32')
      )
      expect(screen.getByRole('cell', { name: '0' })).toHaveClass(
        prefix + (mode === 'code' ? 'narrow' : '32')
      )
      expect(screen.getByRole('columnheader', { name: '부서' })).toHaveClass(
        prefix + (mode === 'code' ? 'wide' : '64')
      )
      expect(screen.getByRole('cell', { name: '개발팀' })).toHaveClass(
        prefix + (mode === 'code' ? 'wide' : '64')
      )
      expect(screen.getByRole('columnheader', { name: '접수' })).toHaveClass(
        prefix + (mode === 'code' ? 'normal' : '40')
      )
    })
    it('비밀글에 값이 들어와도 모든 추가 정보 칸은 비운다', () => {
      renderTable({ ...page({ is_secret: true }), list_columns: tableColumns })
      expect(screen.queryByText('개발팀')).not.toBeInTheDocument()
      expect(screen.queryByText('https://example.test/jobs')).not.toBeInTheDocument()
      expect(screen.getAllByLabelText('값 없음')).toHaveLength(tableColumns.length)
      expect(screen.getByRole('link', { name: /비밀글.*신입 모집/ })).toBeInTheDocument()
    })
    it('값이 없는 행도 같은 헤더를 유지하며 날짜 숨김을 적용한다', () => {
      renderTable(
        { ...page({ list_fields: [] }), list_columns: tableColumns },
        { ...tableBoard, design: { ...tableBoard.design!, show_date: false } }
      )
      expect(screen.getAllByLabelText('값 없음')).toHaveLength(tableColumns.length)
      expect(screen.queryByRole('columnheader', { name: '작성일' })).not.toBeInTheDocument()
      expect(document.querySelector('time')).toBeNull()
    })
    it('이전 API에 열 정보가 없으면 제목 아래 표시를 유지하고 빈 결과는 안내한다', () => {
      const view = renderTable(page())
      expect(screen.queryByRole('table')).not.toBeInTheDocument()
      expect(screen.getByText('부서: 개발팀')).toBeInTheDocument()
      view.unmount()
      renderTable({ ...page(), posts: [], total: 0, list_columns: tableColumns })
      expect(screen.queryByRole('table')).not.toBeInTheDocument()
      expect(screen.getByText('등록된 글이 없습니다.')).toBeInTheDocument()
    })
    it.each(['GALLERY', 'FAQ'] as const)(
      '%s는 열 정보가 있어도 기존 유형을 유지한다',
      (board_type) => {
        renderTable({ ...page(), list_columns: tableColumns }, { ...tableBoard, board_type })
        expect(screen.queryByRole('table')).not.toBeInTheDocument()
        expect(screen.getByText('부서: 개발팀')).toBeInTheDocument()
      }
    )
  })
}

it('공개/회원 공통 페이지 로더가 빈 목록의 열 정보도 전달한다', async () => {
  const list = await loadBoardPage('demo', board, { page: 1 }, async () => ({
    total: 0,
    page: 1,
    size: 10,
    has_posts: false,
    items: [],
    list_columns: tableColumns,
  }))
  expect(list.list_columns).toEqual(tableColumns)
})
