import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PublicSite } from '@/lib/publicSite.types'
import { hospitalAManifest } from '@/templates/hospital-a/manifest'

const { fetchPublicSite, fetchPublicPost, renderer } = vi.hoisted(() => ({
  fetchPublicSite: vi.fn(),
  fetchPublicPost: vi.fn(),
  renderer: vi.fn(),
}))
vi.mock('next/headers', () => ({ headers: async () => new Headers() }))
vi.mock('@/lib/publicSite', () => ({ fetchPublicSite }))
vi.mock('@/lib/publicPosts', async (original) => ({
  ...(await original<typeof import('@/lib/publicPosts')>()),
  fetchPublicPost,
}))
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
}))
vi.mock('@/templates/CodeTemplateRenderer', () => ({ CodeTemplateRenderer: renderer }))
vi.mock('@/components/edit/EditToolbar', () => ({ EditToolbar: () => null }))
vi.mock('@/components/layout/FloatingButtons', () => ({ FloatingButtons: () => null }))

import { CodeRoutePage, codeRouteMetadata } from '@/templates/codeRoute'
import { hospitalAEntry } from '@/templates/hospital-a/entry'
import { TemplateSwitching } from '@/templates/shared/TemplateSwitching'

const news = { id: 'b1', name: '병원 소식', slug: 'news', description: '', board_type: 'LIST' as const }
const site = (template = { renderer: 'code', code: 'TPL_HOSPITAL_A' }): PublicSite =>
  ({
    tenant: { id: 't', slug: 'demo', name: '데모', template_type: 'HOSPITAL', plan_type: 'BASIC', custom_domain: 'clinic.example' },
    sections: [],
    seo_settings: null,
    sns_settings: null,
    template,
    boards: [news],
  }) as unknown as PublicSite

const params = (...path: string[]) => ({ tenant_slug: 'demo', path })
const page = (...path: string[]) =>
  CodeRoutePage({ entry: hospitalAEntry, params: params(...path), searchParams: {} })
const meta = (...path: string[]) => codeRouteMetadata(hospitalAEntry, params(...path))
const NOT_FOUND = '페이지를 찾을 수 없습니다'

beforeEach(() => {
  vi.clearAllMocks()
  fetchPublicSite.mockResolvedValue(site())
})

describe('새 게시판 주소 (T-140-B)', () => {
  it('목록: 게시판 이름 제목 · 대표 주소 · pageKey', async () => {
    const m = await meta('b', 'news')
    expect(m.title).toBe('병원 소식 | 데모')
    expect(JSON.stringify(m.alternates)).toContain('/b/news')
    const tree = await page('b', 'news')
    expect(JSON.stringify(tree)).toContain('"pageKey":"b/news"')
  })

  it('상세: 글 제목 · 대표 주소', async () => {
    fetchPublicPost.mockResolvedValue({ id: 'p1', title: '첫 글' })
    const m = await meta('b', 'news', 'p1')
    expect(m.title).toBe('첫 글 | 데모')
    expect(JSON.stringify(m.alternates)).toContain('/b/news/p1')
    expect(fetchPublicPost).toHaveBeenCalledWith('demo', 'news', 'p1')
  })

  it.each([
    ['없는 게시판', ['b', 'gone']],
    ['기본 게시판 (공지는 /notice)', ['b', 'notice']],
    ['게시판 없는 주소', ['b']],
    ['더 깊은 주소', ['b', 'news', 'p1', 'x']],
  ])('%s → 404', async (_name, path) => {
    expect((await meta(...path)).title).toBe(NOT_FOUND)
    await expect(page(...path)).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('없는 글 · 비공개 글 → 404', async () => {
    fetchPublicPost.mockResolvedValue(null)
    await expect(page('b', 'news', 'gone')).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('사용을 끈 게시판(응답에 없음) → 404', async () => {
    fetchPublicSite.mockResolvedValue({ ...site(), boards: [] })
    await expect(page('b', 'news')).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('방금 템플릿을 바꿨으면 전환 안내', async () => {
    fetchPublicSite.mockResolvedValue(site({ renderer: 'theme', code: 'X' }))
    const tree = (await page('b', 'news')) as { type: unknown }
    expect(tree.type).toBe(TemplateSwitching)
  })

  it('매니페스트 페이지 key 와 겹치지 않는다', () => {
    expect(hospitalAManifest.pages.map((p) => p.key)).not.toContain('b')
  })
})
