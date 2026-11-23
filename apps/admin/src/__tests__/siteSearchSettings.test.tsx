import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouterProvider, createMemoryRouter } from 'react-router'
import type { AeoResponse, GeoResponse } from '@cms/types'
import { renderWithQuery } from './renderWithQuery'
import { AeoPage } from '@/pages/AeoPage'
import { GeoPage } from '@/pages/GeoPage'
import { breadcrumbsFor } from '@/components/layout/navigation'
import { composeRobotsTxt, mentionsAgent } from '@/lib/robotsPreview'
import { useAuthStore } from '@/stores/authStore'

// 사이트 관리 AEO · GEO (T-221, 사이트 관리 기획서 SM-05 · SM-06)
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

const ok = (data: unknown) => Promise.resolve({ data: { data } })

const aeo = (over: Partial<AeoResponse> = {}): AeoResponse => ({
  faq_board_ids: [],
  boards: [
    {
      id: 'b1',
      name: '자주 묻는 질문',
      slug: 'faq',
      active: true,
      member_only: false,
      items: [
        {
          post_id: 'p1',
          question: '진료 시간은?',
          answer: '평일 9시부터',
          public: true,
          note: null,
        },
        { post_id: 'p2', question: '주차되나요?', answer: '네', public: false, note: '비밀글' },
      ],
    },
    {
      id: 'b2',
      name: '회원 FAQ',
      slug: 'member-faq',
      active: true,
      member_only: true,
      items: [],
    },
  ],
  ...over,
})

const geo = (over: Partial<GeoResponse['settings']> = {}): GeoResponse => ({
  settings: {
    description: '',
    topics: [],
    profile_urls: [],
    evidence: [],
    crawlers: {},
    ...over,
  },
  crawlers: [
    { name: 'GPTBot', label: 'OpenAI 모델 학습' },
    { name: 'ClaudeBot', label: 'Anthropic 모델 학습' },
  ],
})

let seoRobots: string | null = null

const renderAt = (path: string, page: React.ReactElement) =>
  renderWithQuery(
    <RouterProvider
      router={createMemoryRouter(
        [
          { path, element: page },
          { path: '*', element: <p>이동한 화면</p> },
        ],
        { initialEntries: [path] }
      )}
    />
  )

const setRole = (role: string) =>
  useAuthStore.setState({ user: { role } } as unknown as Parameters<
    typeof useAuthStore.setState
  >[0])

beforeEach(() => {
  vi.clearAllMocks()
  setRole('TENANT_ADMIN')
  seoRobots = null
  get.mockImplementation((url: string) => {
    if (url === '/v1/seo-settings/aeo') return ok(aeo())
    if (url === '/v1/seo-settings/geo') return ok(geo())
    if (url === '/v1/seo-settings')
      return ok({ robots_txt: seoRobots, canonical_url: 'https://my-clinic.com' })
    return ok(undefined)
  })
})

describe('사이트 관리 경로 (T-221)', () => {
  it('헤더 경로는 사이트 관리 / 화면 이름', () => {
    expect(breadcrumbsFor('/admin/site/aeo')).toEqual([
      { label: '사이트 관리', to: '/admin/site' },
      { label: 'AEO 설정' },
    ])
    expect(breadcrumbsFor('/admin/site/policies').at(-1)).toEqual({ label: '약관 · 정책 관리' })
  })
})

describe('AEO 설정', () => {
  it('FAQ 게시판 글을 질문 목록으로 — 빠지는 글은 까닭과 함께', async () => {
    renderAt('/admin/site/aeo', <AeoPage />)
    const card = await screen.findByRole('region', { name: /자주 묻는 질문/ })
    expect(within(card).getByText('진료 시간은?')).toBeInTheDocument()
    expect(within(card).getByText('넣음')).toBeInTheDocument()
    expect(within(card).getByText('빠짐 · 비밀글')).toBeInTheDocument()
    expect(within(card).getByRole('link', { name: '질문 추가' })).toHaveAttribute(
      'href',
      '/admin/boards/b1/posts/new'
    )
    expect(within(card).getAllByRole('link', { name: '수정' })[0]).toHaveAttribute(
      'href',
      '/admin/boards/b1/posts/p1/edit'
    )
  })

  it('켜면 검사 결과 · 생성 결과가 보이고, 저장하면 켠 게시판을 보낸다', async () => {
    put.mockImplementation(() => ok(aeo({ faq_board_ids: ['b1'] })))
    const user = userEvent.setup()
    renderAt('/admin/site/aeo', <AeoPage />)
    const card = await screen.findByRole('region', { name: /자주 묻는 질문/ })
    expect(screen.getByRole('button', { name: '변경사항 저장' })).toBeDisabled()

    await user.click(within(card).getByRole('checkbox', { name: /FAQ 구조화 데이터 만들기/ }))

    expect(within(card).getByRole('status')).toHaveTextContent('질문 1개를 넣어요 · 1개는')
    await user.click(within(card).getByText('생성 결과 보기'))
    expect(within(card).getByText(/"@type": "FAQPage"/)).toBeInTheDocument()
    expect(screen.getByText('저장되지 않은 변경사항이 있습니다.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '변경사항 저장' }))

    expect(put).toHaveBeenCalledWith('/v1/seo-settings/aeo', { faq_board_ids: ['b1'] })
    await waitFor(() => expect(toast.success).toHaveBeenCalled())
    expect(screen.getByText('모든 변경사항이 저장되었습니다.')).toBeInTheDocument()
  })

  it('회원만 읽는 게시판은 켤 수 없다', async () => {
    renderAt('/admin/site/aeo', <AeoPage />)
    const card = await screen.findByRole('region', { name: /회원 FAQ/ })
    expect(within(card).getByRole('checkbox', { name: /FAQ 구조화 데이터 만들기/ })).toBeDisabled()
    expect(within(card).getByText(/검색엔진이 글을 볼 수 없어요/)).toBeInTheDocument()
  })

  it('변경 취소로 저장된 값으로 되돌린다', async () => {
    const user = userEvent.setup()
    renderAt('/admin/site/aeo', <AeoPage />)
    const card = await screen.findByRole('region', { name: /자주 묻는 질문/ })
    const toggle = within(card).getByRole('checkbox', { name: /FAQ 구조화 데이터 만들기/ })
    await user.click(toggle)
    await user.click(screen.getByRole('button', { name: '변경 취소' }))
    expect(toggle).not.toBeChecked()
    expect(put).not.toHaveBeenCalled()
  })

  it('FAQ 게시판이 없으면 만들기 안내', async () => {
    get.mockImplementation(() => ok(aeo({ boards: [] })))
    renderAt('/admin/site/aeo', <AeoPage />)
    expect(await screen.findByRole('link', { name: 'FAQ 게시판 만들기' })).toHaveAttribute(
      'href',
      '/admin/boards/new?example=faq'
    )
    // 연결할 게시판이 없으면 저장 막대도 없다 (T-226)
    expect(screen.queryByRole('button', { name: '변경사항 저장' })).not.toBeInTheDocument()
  })

  it('저장 실패는 알림으로, 바꾼 값은 그대로', async () => {
    put.mockRejectedValue(new Error('fail'))
    const user = userEvent.setup()
    renderAt('/admin/site/aeo', <AeoPage />)
    const card = await screen.findByRole('region', { name: /자주 묻는 질문/ })
    await user.click(within(card).getByRole('checkbox', { name: /FAQ 구조화 데이터 만들기/ }))
    await user.click(screen.getByRole('button', { name: '변경사항 저장' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalled())
    expect(within(card).getByRole('checkbox', { name: /FAQ 구조화 데이터 만들기/ })).toBeChecked()
  })

  it('보기 전용 계정은 저장 막대가 없고 켤 수 없다', async () => {
    setRole('TENANT_VIEWER')
    renderAt('/admin/site/aeo', <AeoPage />)
    const card = await screen.findByRole('region', { name: /자주 묻는 질문/ })
    expect(within(card).getByRole('checkbox', { name: /FAQ 구조화 데이터 만들기/ })).toBeDisabled()
    expect(screen.queryByRole('button', { name: '변경사항 저장' })).not.toBeInTheDocument()
  })
})

describe('GEO 설정', () => {
  it('정보를 고치면 정리한 값으로 저장한다 — 빈 주소 · 기존 유지는 뺀다', async () => {
    put.mockImplementation((_url: string, body: GeoResponse['settings']) => ok(geo(body)))
    const user = userEvent.setup()
    renderAt('/admin/site/geo', <GeoPage />)

    await user.type(await screen.findByLabelText('기업 소개'), '강남 치과')
    await user.type(screen.getByLabelText('서비스 · 주제 키워드'), '임플란트, 교정, ')
    await user.click(screen.getByRole('button', { name: '주소 추가' }))
    await user.type(screen.getByLabelText('공식 프로필 주소 1'), 'https://blog.naver.com/a')
    await user.click(screen.getByRole('button', { name: '주소 추가' }))
    await user.click(screen.getByRole('button', { name: '근거 정보 추가' }))
    await user.type(screen.getByLabelText('주장 · 정보 1'), '개원 2010년')
    await user.type(screen.getByLabelText('출처 주소 1'), 'https://my-clinic.com/about')
    await user.selectOptions(screen.getByLabelText('GPTBot 접근 정책'), 'block')
    await user.selectOptions(screen.getByLabelText('ClaudeBot 접근 정책'), 'allow')
    await user.selectOptions(screen.getByLabelText('ClaudeBot 접근 정책'), 'keep')
    await user.click(screen.getByRole('button', { name: '변경사항 저장' }))

    expect(put).toHaveBeenCalledWith('/v1/seo-settings/geo', {
      description: '강남 치과',
      topics: ['임플란트', '교정'],
      profile_urls: ['https://blog.naver.com/a'],
      evidence: [{ claim: '개원 2010년', url: 'https://my-clinic.com/about', checked_at: null }],
      crawlers: { GPTBot: 'block' },
    })
    await waitFor(() => expect(toast.success).toHaveBeenCalled())
  })

  it('쉬운 말 한 줄 · SEO 바로가기 · 입력한 항목 수 (T-230)', async () => {
    const user = userEvent.setup()
    renderAt('/admin/site/geo', <GeoPage />)
    expect(await screen.findByText('AI 답변 서비스에 브랜드 소개')).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: 'SEO 설정에서 바꾸기 →' })).toHaveAttribute(
      'href',
      '/admin/site/seo'
    )
    expect(screen.getByText(/3가지 중\s*0\s*가지 입력/)).toBeInTheDocument()
    await user.type(screen.getByLabelText('기업 소개'), '강남 치과')
    await user.type(screen.getByLabelText('서비스 · 주제 키워드'), '임플란트')
    expect(screen.getByText(/3가지 중\s*2\s*가지 입력/)).toBeInTheDocument()
  })

  it('크롤러 정책을 robots.txt 예상 결과에 바로 보여 준다', async () => {
    const user = userEvent.setup()
    renderAt('/admin/site/geo', <GeoPage />)
    await user.selectOptions(await screen.findByLabelText('GPTBot 접근 정책'), 'block')
    const preview = screen.getByLabelText('robots.txt 예상 결과')
    expect(preview.textContent).toContain('User-agent: GPTBot\nDisallow: /')
    expect(preview.textContent).not.toContain('ClaudeBot')
  })

  it('SEO 의 robots.txt 에 이미 있는 크롤러는 경고하고 더하지 않는다', async () => {
    seoRobots = 'User-agent: *\nAllow: /\n\nUser-agent: GPTBot\nAllow: /'
    const user = userEvent.setup()
    renderAt('/admin/site/geo', <GeoPage />)
    await user.selectOptions(await screen.findByLabelText('GPTBot 접근 정책'), 'block')
    expect(screen.getByText(/이미 이 크롤러 규칙이 있어/)).toBeInTheDocument()
    expect(screen.getByLabelText('robots.txt 예상 결과').textContent).not.toContain('Disallow')
  })

  it('저장된 값을 불러오고, 1년 지난 확인일은 다시 확인 안내', async () => {
    get.mockImplementation((url: string) =>
      url === '/v1/seo-settings/geo'
        ? ok(
            geo({
              description: '소개',
              topics: ['임플란트'],
              evidence: [{ claim: '주장', url: 'https://a.com', checked_at: '2020-01-01' }],
              crawlers: { ClaudeBot: 'allow' },
            })
          )
        : ok({ robots_txt: null, canonical_url: null })
    )
    renderAt('/admin/site/geo', <GeoPage />)
    expect(await screen.findByLabelText('기업 소개')).toHaveValue('소개')
    expect(screen.getByLabelText('서비스 · 주제 키워드')).toHaveValue('임플란트')
    expect(screen.getByLabelText('ClaudeBot 접근 정책')).toHaveValue('allow')
    expect(screen.getByText(/1년이 지났어요/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '변경사항 저장' })).toBeDisabled()
  })

  it('키워드가 10개를 넘으면 칸 아래에 알린다', async () => {
    const user = userEvent.setup()
    renderAt('/admin/site/geo', <GeoPage />)
    const input = await screen.findByLabelText('서비스 · 주제 키워드')
    await user.type(input, Array.from({ length: 11 }, (_, i) => `k${i}`).join(','))
    expect(screen.getByText('키워드는 10개까지예요.')).toBeInTheDocument()
  })

  it('불러오기 실패', async () => {
    get.mockImplementation(() => Promise.reject(new Error('fail')))
    renderAt('/admin/site/geo', <GeoPage />)
    expect(await screen.findByText('GEO 설정을 불러오지 못했습니다.')).toBeInTheDocument()
  })
})

describe('robots.txt 미리보기 규칙', () => {
  const base = 'User-Agent: *\nAllow: /\n'

  it('허용 · 차단만 더하고 기존 유지는 그대로', () => {
    expect(composeRobotsTxt(base, { GPTBot: 'block', CCBot: 'allow', ClaudeBot: 'keep' })).toBe(
      `${base}\n# AI 크롤러 (사이트 관리 → GEO 설정)\nUser-agent: GPTBot\nDisallow: /\n\nUser-agent: CCBot\nAllow: /\n`
    )
    expect(composeRobotsTxt(base, {})).toBe(base)
  })

  it('이미 있는 크롤러 규칙은 대소문자 · 공백과 상관없이 찾는다', () => {
    expect(mentionsAgent('user-agent:   gptbot  \nDisallow: /', 'GPTBot')).toBe(true)
    expect(mentionsAgent('User-agent: GPTBot-Extra', 'GPTBot')).toBe(false)
    expect(mentionsAgent('User-agent: Google-Extended', 'Google.Extended')).toBe(false)
  })
})
