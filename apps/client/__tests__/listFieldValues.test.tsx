import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { BoardType, PublicBoard, PublicFieldValue } from '@cms/types'
import { CustomBoardList } from '@/templates/hospital-a/components/board/CustomBoardViews'
import { ThemeBoardListView } from '@/components/board/ThemeBoard'
import type { BoardPage } from '@/lib/boardRoute'

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
