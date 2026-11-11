import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import type { PublicBoard, PublicPost } from '@cms/types'
import { ThemeBoardDetail } from '@/components/board/ThemeBoard'
import { fileSize } from '@/lib/fileSize'
import { CustomBoardDetail } from '@/templates/hospital-a/components/board/CustomBoardViews'

const board: PublicBoard = {
  id: 'b1',
  name: '소식',
  slug: 'news',
  description: '',
  board_type: 'LIST',
  write_access: 'ADMIN',
}

const post: PublicPost = {
  id: 'p1',
  title: '진료 안내',
  is_pinned: false,
  published_at: '2026-11-06T00:00:00Z',
  body: [{ type: 'paragraph', content: [{ type: 'text', text: '본문' }] }],
  fields: [],
  attachments: [
    {
      id: 'f1',
      name: '진료 안내.pdf',
      size: 2_516_582,
      url: 'http://cdn/t/attachments/f1.pdf',
      content_type: 'application/pdf',
    },
    {
      id: 'f2',
      name: '서식.hwp',
      size: 34_000,
      url: 'http://cdn/t/attachments/f2.hwp',
      content_type: 'application/x-hwp',
    },
  ],
  prev_id: null,
  next_id: null,
}

const hrefFor = (x?: { id?: string }) => (x?.id ? `/demo/b/news/${x.id}` : '/demo/b/news')

describe('글 첨부 파일 — 홈페이지 (T-194)', () => {
  it.each([
    [
      '테마형',
      () => <ThemeBoardDetail board={board} post={post} hrefFor={hrefFor} tenantSlug="demo" />,
    ],
    [
      '코드형',
      () => <CustomBoardDetail board={board} post={post} hrefFor={hrefFor} tenantSlug="demo" />,
    ],
  ])('%s 글 아래 원래 이름 · 크기로 보여 준다', (_kind, view) => {
    render(view())
    const files = screen.getByRole('region', { name: '첨부 파일' })
    const link = within(files).getByRole('link', { name: '진료 안내.pdf' })
    expect(link).toHaveAttribute('href', 'http://cdn/t/attachments/f1.pdf')
    expect(within(files).getByText('2.4MB')).toBeInTheDocument()
    expect(within(files).getByRole('link', { name: '서식.hwp' })).toBeInTheDocument()
  })

  it('첨부가 없거나 잠긴 비밀글이면 보이지 않는다', () => {
    const { unmount } = render(
      <ThemeBoardDetail
        board={board}
        post={{ ...post, attachments: [] }}
        hrefFor={hrefFor}
        tenantSlug="demo"
      />
    )
    expect(screen.queryByRole('region', { name: '첨부 파일' })).not.toBeInTheDocument()
    unmount()
    render(
      <CustomBoardDetail
        board={board}
        post={{ ...post, locked: true }}
        hrefFor={hrefFor}
        tenantSlug="demo"
      />
    )
    expect(screen.queryByRole('region', { name: '첨부 파일' })).not.toBeInTheDocument()
  })

  it('크기는 KB · MB 로', () => {
    expect(fileSize(500)).toBe('1KB')
    expect(fileSize(34_000)).toBe('33KB')
    expect(fileSize(2_516_582)).toBe('2.4MB')
  })
})
