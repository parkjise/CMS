import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PublicBoard } from '@cms/types'
import { loadBoardPage } from '@/lib/boardRoute'
import { fetchPublicPosts } from '@/lib/publicPosts'

const board: PublicBoard = { id: 'b1', name: '소식', slug: 'news', description: '', board_type: 'LIST' }

const respond = (total: number) =>
  vi.fn(async (url: string) => {
    const size = Number(new URL(url, 'http://x').searchParams.get('size') ?? 10)
    return new Response(
      JSON.stringify({ data: { total, page: 1, size, has_posts: total > 0, items: [] } }),
      { status: 200 },
    )
  })

describe('페이지당 글 수 (T-146)', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  it('설정이 있으면 그 수로 페이지를 나눈다', async () => {
    const fetchMock = respond(45)
    vi.stubGlobal('fetch', fetchMock)
    const list = await loadBoardPage('demo', { ...board, page_size: 20 }, { page: 1 })
    expect(list.totalPages).toBe(3)
    expect(String(fetchMock.mock.calls[0][0])).toContain('size=20')
  })

  it('자동이면 유형별 기본값', async () => {
    const fetchMock = respond(25)
    vi.stubGlobal('fetch', fetchMock)
    const list = await loadBoardPage('demo', { ...board, board_type: 'GALLERY', page_size: null }, { page: 1 })
    expect(list.totalPages).toBe(3)
    expect(String(fetchMock.mock.calls[0][0])).toContain('size=12')
  })

  it('크기를 안 주면 서버가 게시판 설정으로 정한다 (공지)', async () => {
    const fetchMock = respond(1)
    vi.stubGlobal('fetch', fetchMock)
    await fetchPublicPosts('demo', 'notice', { page: 2 })
    const url = String(fetchMock.mock.calls[0][0])
    expect(url).toContain('page=2')
    expect(url).not.toContain('size=')
  })
})
