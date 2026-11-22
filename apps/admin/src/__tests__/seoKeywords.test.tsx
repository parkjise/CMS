import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouterProvider, createMemoryRouter } from 'react-router'
import { renderWithQuery } from './renderWithQuery'
import { SeoPage } from '@/pages/SeoPage'
import { summarizeSitemap } from '@/lib/sitemapCheck'
import { useAuthStore } from '@/stores/authStore'

// SEO 설정 — 대표 키워드 (T-040-A) · 메타 칸 (T-129) · 저장 막대 · 미리보기 · 사이트맵 확인 (T-225)
const { get, put, toast } = vi.hoisted(() => ({
  get: vi.fn(),
  put: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

vi.mock('@/lib/api', () => ({ api: { get, put } }))
vi.mock('@cms/ui', async (original) => ({
  ...(await original<typeof import('@cms/ui')>()),
  toast,
}))

const SEO = {
  id: 's1',
  tenant_id: 't1',
  meta_title: '강남 OO의원',
  meta_description: '설명',
  og_image_url: null,
  og_title: null,
  og_description: null,
  canonical_url: null,
  robots: 'index,follow',
  robots_txt: null,
  google_analytics_id: null,
  naver_site_verification: null,
  google_site_verification: null,
  keywords: ['강남 통증의학과'],
  updated_at: '2026-10-29T00:00:00Z',
}

const ok = (data: unknown) => Promise.resolve({ data: { success: true, data } })

let keywordsAllowed = true
let domain: unknown = null

const renderPage = () =>
  renderWithQuery(
    <RouterProvider
      router={createMemoryRouter(
        [
          { path: '/admin/site/seo', element: <SeoPage /> },
          { path: '*', element: <p>이동한 화면</p> },
        ],
        { initialEntries: ['/admin/site/seo'] }
      )}
    />
  )

const setRole = (role: string) =>
  useAuthStore.setState({ user: { role }, tenantSlug: 'demo' } as unknown as Parameters<
    typeof useAuthStore.setState
  >[0])

const putBody = () => put.mock.calls.at(-1)?.[1]
const saveButton = () => screen.getByRole('button', { name: '변경사항 저장' })

beforeEach(() => {
  vi.clearAllMocks()
  keywordsAllowed = true
  domain = null
  setRole('TENANT_ADMIN')
  get.mockImplementation((url: string) => {
    if (url === '/v1/seo-settings/limits') {
      return ok({ keywords_allowed: keywordsAllowed, keywords_max: 5, keyword_max_length: 30 })
    }
    if (url === '/v1/domain/status') return ok(domain)
    if (url === '/v1/seo-settings/geo') {
      return ok({ settings: { crawlers: { GPTBot: 'block' } }, crawlers: [] })
    }
    return ok(SEO)
  })
  put.mockImplementation((_url: string, body: object) => ok({ ...SEO, ...body }))
})

afterEach(() => vi.unstubAllGlobals())

describe('SeoPage 대표 키워드', () => {
  it('저장된 키워드를 불러오고, 추가한 키워드를 함께 저장', async () => {
    const user = userEvent.setup()
    renderPage()
    expect(await screen.findByText('강남 통증의학과')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByLabelText('키워드 입력')).not.toBeDisabled())
    await user.type(screen.getByLabelText('키워드 입력'), '허리 비수술{Enter}')
    await user.click(saveButton())
    await waitFor(() => expect(put).toHaveBeenCalled())
    expect(putBody()).toMatchObject({ keywords: ['강남 통증의학과', '허리 비수술'] })
  })

  it('BASIC 이면 잠금 안내 · 입력 막힘 · 저장 시 키워드를 보내지 않는다', async () => {
    keywordsAllowed = false
    const user = userEvent.setup()
    renderPage()
    expect(await screen.findByText(/STANDARD 이상 요금제에서 저장할 수 있어요/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '요금제 보기' })).toHaveAttribute(
      'href',
      '/admin/billing'
    )
    expect(screen.getByLabelText('키워드 입력')).toBeDisabled()
    // 저장돼 있던 키워드는 보이지만 지울 수 없다
    expect(screen.getByText('강남 통증의학과')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '강남 통증의학과 삭제' })).not.toBeInTheDocument()
    await user.type(screen.getByPlaceholderText(/강남 통증의학과 OO의원/), ' 추가')
    await user.click(saveButton())
    await waitFor(() => expect(put).toHaveBeenCalled())
    expect(putBody()).not.toHaveProperty('keywords')
  })
})

// 소셜 제목 · 설명, 대표 주소, 검색 노출 (T-129)
describe('SEO 메타 칸', () => {
  it('소셜 미리보기 탭에서 제목 · 설명을 저장한다', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: /소셜 미리보기/ }))
    await user.type(screen.getByLabelText('소셜 공유 제목'), '공유 제목')
    await user.type(screen.getByLabelText('소셜 공유 설명'), '공유 설명')
    await user.click(saveButton())
    await waitFor(() =>
      expect(putBody()).toMatchObject({
        og_image_url: null,
        og_title: '공유 제목',
        og_description: '공유 설명',
      })
    )
  })

  it('사이트맵 탭에서 검색 노출 · 대표 주소를 저장한다', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: /사이트맵/ }))
    await user.selectOptions(screen.getByLabelText('검색 노출'), 'noindex,nofollow')
    await user.type(screen.getByLabelText('대표 주소 (canonical)'), 'https://a.com')
    await user.click(saveButton())
    await waitFor(() =>
      expect(putBody()).toMatchObject({
        robots: 'noindex,nofollow',
        canonical_url: 'https://a.com',
        robots_txt: null,
      })
    )
  })
})

describe('저장 막대 · 나가기 확인 (T-225)', () => {
  it('바꾼 것이 없으면 저장할 수 없고, 여러 탭에서 고친 내용을 한 번에 저장한다', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('강남 통증의학과')
    expect(saveButton()).toBeDisabled()
    expect(screen.getByText('모든 변경사항이 저장되었습니다.')).toBeInTheDocument()

    const title = screen.getByPlaceholderText(/강남 통증의학과 OO의원/)
    await user.clear(title)
    await user.type(title, '새 제목')
    await user.click(screen.getByRole('button', { name: /소셜 미리보기/ }))
    await user.type(screen.getByLabelText('소셜 공유 제목'), '공유 제목')
    await user.click(screen.getByRole('button', { name: /분석 연동/ }))
    await user.type(screen.getByPlaceholderText('G-XXXXXXXXXX'), 'G-ABC')
    // 탭을 옮겨도 고친 내용은 남는다
    await user.click(screen.getByRole('button', { name: /기본 SEO/ }))
    expect(screen.getByPlaceholderText(/강남 통증의학과 OO의원/)).toHaveValue('새 제목')
    expect(screen.getByText('저장되지 않은 변경사항이 있습니다.')).toBeInTheDocument()

    await user.click(saveButton())
    await waitFor(() => expect(put).toHaveBeenCalledTimes(1))
    expect(putBody()).toMatchObject({
      meta_title: '새 제목',
      og_title: '공유 제목',
      google_analytics_id: 'G-ABC',
    })
    await waitFor(() => expect(toast.success).toHaveBeenCalled())
    expect(saveButton()).toBeDisabled()
  })

  it('[변경 취소]는 저장된 값으로 되돌린다', async () => {
    const user = userEvent.setup()
    renderPage()
    const title = await screen.findByDisplayValue('강남 OO의원')
    await user.type(title, '!!')
    await user.click(screen.getByRole('button', { name: '변경 취소' }))
    expect(screen.getByDisplayValue('강남 OO의원')).toBeInTheDocument()
    expect(saveButton()).toBeDisabled()
  })

  it('글자 수를 넘으면 저장을 막고 까닭을 알려 준다', async () => {
    const user = userEvent.setup()
    renderPage()
    const title = await screen.findByDisplayValue('강남 OO의원')
    await user.clear(title)
    await user.click(title)
    await user.paste('가'.repeat(61))
    expect(screen.getByText(/글자 수 제한을 넘은 칸이 있어요/)).toBeInTheDocument()
    expect(saveButton()).toBeDisabled()
  })

  it('저장 실패 시 입력을 남기고 오류를 알린다', async () => {
    put.mockRejectedValueOnce(new Error('fail'))
    const user = userEvent.setup()
    renderPage()
    const title = await screen.findByDisplayValue('강남 OO의원')
    await user.type(title, '!')
    await user.click(saveButton())
    await waitFor(() => expect(toast.error).toHaveBeenCalled())
    expect(screen.getByDisplayValue('강남 OO의원!')).toBeInTheDocument()
  })

  it('고친 채 다른 화면으로 가면 확인을 묻고, 취소하면 남는다', async () => {
    const user = userEvent.setup()
    renderPage()
    const title = await screen.findByDisplayValue('강남 OO의원')
    await user.type(title, '!')
    // robots.txt 규칙 안의 GEO 설정 링크로 이동
    await user.click(screen.getByRole('button', { name: /사이트맵/ }))
    await user.click(screen.getByText('규칙 보기'))
    await user.click(screen.getByRole('link', { name: 'GEO 설정' }))
    // 공통 나가기 확인 창 (T-227)
    await user.click(await screen.findByRole('button', { name: '계속 편집' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByText('이동한 화면')).not.toBeInTheDocument()
    // 사이트맵 탭에 있어도 고친 내용은 남아 있다
    expect(screen.getByText('저장되지 않은 변경사항이 있습니다.')).toBeInTheDocument()
  })

  it('보기 전용 계정에는 저장 막대가 없다', async () => {
    setRole('TENANT_VIEWER')
    renderPage()
    await screen.findByDisplayValue('강남 OO의원')
    expect(screen.queryByRole('button', { name: '변경사항 저장' })).not.toBeInTheDocument()
  })
})

describe('검색 결과 미리보기 (T-225)', () => {
  it('빈 칸 · 너무 긴 칸 · 검색 숨김을 알려 준다', async () => {
    const user = userEvent.setup()
    renderPage()
    const title = await screen.findByDisplayValue('강남 OO의원')
    await user.clear(title)
    expect(screen.getByText('(사업체 이름)')).toBeInTheDocument()
    expect(screen.getByText(/사업체 이름이 제목으로 나가요/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /사이트맵/ }))
    await user.selectOptions(screen.getByLabelText('검색 노출'), 'noindex,follow')
    expect(screen.getByText(/검색에 나오지 않게 설정돼 있어요/)).toBeInTheDocument()
  })

  it('대표 주소 → 연결한 도메인 → 기본 주소 순으로 주소를 보여 준다', async () => {
    domain = { domain: 'my-clinic.com', status: 'ACTIVE' }
    const user = userEvent.setup()
    renderPage()
    expect(await screen.findByText('https://my-clinic.com')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /사이트맵/ }))
    await user.type(screen.getByLabelText('대표 주소 (canonical)'), 'https://a.com')
    expect(screen.getByText('https://a.com')).toBeInTheDocument()
  })
})

describe('사이트맵 · robots.txt 확인 (T-225)', () => {
  const ID = '11111111-2222-3333-4444-555555555555'
  const xml = (base: string) =>
    `<urlset><url><loc>${base}</loc></url><url><loc>${base}/about</loc></url><url><loc>${base}/b/news</loc></url><url><loc>${base}/b/news/${ID}</loc></url></urlset>`

  it('summarizeSitemap 은 메인 뒤 경로와 글 수를 센다', () => {
    const summary = summarizeSitemap(xml('http://h/demo'), 'http://h/demo')
    expect(summary.paths).toEqual(['/', '/about', '/b/news', `/b/news/${ID}`])
    expect(summary).toMatchObject({ pages: 3, posts: 1 })
  })

  it('실제 홈페이지 사이트맵 주소를 안내하고, [생성 결과 확인]으로 목록을 보여 준다', async () => {
    const fetchMock = vi.fn(async () => new Response(xml('http://localhost:3000/demo')))
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: /사이트맵/ }))
    expect(screen.getByText('http://localhost:3000/demo/sitemap.xml')).toBeInTheDocument()
    // 예전 백엔드 주소는 더 안내하지 않는다
    expect(screen.queryByText(/public\/sitemap/)).not.toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: '생성 결과 확인' }))
    expect(await screen.findByText(/주소 4개 · 메인 · 페이지 · 게시판 3개 · 글 1개/)).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:3000/demo/sitemap.xml', {
      cache: 'no-store',
    })
    expect(screen.getByText('/about')).toBeInTheDocument()
  })

  it('불러오지 못하면 안내한다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 500 }))
    )
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: /사이트맵/ }))
    await user.click(screen.getByRole('button', { name: '생성 결과 확인' }))
    expect(await screen.findByText(/사이트맵을 불러오지 못했습니다/)).toBeInTheDocument()
  })

  it('연결한 도메인이면 그 주소를 안내하고, robots.txt 규칙에 GEO 크롤러를 더해 보여 준다', async () => {
    domain = { domain: 'my-clinic.com', status: 'ACTIVE' }
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: /사이트맵/ }))
    expect(screen.getByText('https://my-clinic.com/sitemap.xml')).toBeInTheDocument()
    await user.click(screen.getByText('규칙 보기'))
    const rules = screen.getByText(/Sitemap: https:\/\/my-clinic.com\/sitemap.xml/)
    expect(rules.textContent).toContain('User-agent: GPTBot\nDisallow: /')
  })
})
