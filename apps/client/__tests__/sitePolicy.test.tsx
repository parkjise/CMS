import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { Footer } from '@/components/layout/Footer'
import { PolicyArticle } from '@/components/policy/PolicyArticle'
import { PolicyLinks } from '@/components/policy/PolicyLinks'
import {
  isPolicyKind,
  policyDate,
  policyVersionParam,
  policyHref,
  policyParagraphs,
  type SitePolicy,
} from '@/lib/sitePolicy'
import { PolicyView } from '@/templates/hospital-a/components/PolicyView'
import { MemberAgree } from '@/templates/hospital-a/components/member/parts'

const policy: SitePolicy = {
  kind: 'privacy',
  title: '개인정보처리방침',
  body: '1. 수집 항목\n- 이름\n\n2. 보유 기간\n- 30일',
  is_default: false,
  updated_at: '2026-11-11T03:00:00Z',
}

describe('약관 · 방침 — 홈페이지 (T-200)', () => {
  it('문단 · 주소 · 날짜 도우미', () => {
    expect(policyParagraphs('가\n나\n\n\n다  \n\n')).toEqual(['가\n나', '다'])
    expect(policyHref('demo', 'terms')).toBe('/demo/terms')
    expect(policyHref('demo', 'privacy', true)).toBe('/privacy')
    expect(policyDate('2026-11-11T03:00:00Z')).toBe('2026.11.11')
    expect(isPolicyKind('terms')).toBe(true)
    expect(isPolicyKind('refund')).toBe(false)
  })

  it.each([
    ['테마형', () => <PolicyArticle policy={policy} />],
    ['코드형', () => <PolicyView policy={policy} />],
  ])('%s 문서 — 제목 · 시행일 · 문단', (_kind, view) => {
    const { container } = render(view())
    expect(screen.getByRole('heading', { name: '개인정보처리방침' })).toBeInTheDocument()
    expect(screen.getByText('시행일 2026.11.11')).toBeInTheDocument()
    expect(container.querySelectorAll('p').length).toBeGreaterThanOrEqual(3)
    expect(screen.getByText(/2\. 보유 기간/)).toBeInTheDocument()
  })

  it('기본 문안이면 시행일을 쓰지 않는다', () => {
    render(<PolicyArticle policy={{ ...policy, is_default: true, updated_at: null }} />)
    expect(screen.queryByText(/시행일/)).not.toBeInTheDocument()
  })

  it('테마형 푸터 — 주소가 있으면 약관 · 방침 링크', () => {
    const { unmount } = render(<Footer tenantName="병원" sns={null} policyBase="/demo" />)
    const nav = screen.getByRole('navigation', { name: '약관 및 정책' })
    expect(within(nav).getByRole('link', { name: '이용약관' })).toHaveAttribute(
      'href',
      '/demo/terms'
    )
    expect(within(nav).getByRole('link', { name: '개인정보처리방침' })).toHaveAttribute(
      'href',
      '/demo/privacy'
    )
    unmount()
    render(<Footer tenantName="병원" sns={null} />)
    expect(screen.queryByRole('navigation', { name: '약관 및 정책' })).not.toBeInTheDocument()
  })

  it('동의 체크박스 [보기] — 새 탭으로', () => {
    render(<PolicyLinks slug="demo" />)
    const link = screen.getByRole('link', { name: '이용약관 보기' })
    expect(link).toHaveAttribute('href', '/demo/terms')
    expect(link).toHaveAttribute('target', '_blank')
    expect(screen.getByRole('link', { name: '개인정보처리방침 보기' })).toHaveAttribute(
      'href',
      '/demo/privacy'
    )
  })

  it('hospital-a 가입 동의 [보기]', () => {
    render(
      <MemberAgree
        id="jn"
        slug="demo"
        register={(() => ({})) as never}
        all={{ checked: false, toggle: () => undefined }}
      />
    )
    const links = screen.getAllByRole('link', { name: '[보기]' })
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['/demo/terms', '/demo/privacy'])
  })
})

describe('약관 · 방침 버전 — 홈페이지 (T-224)', () => {
  const versioned: SitePolicy = {
    ...policy,
    version: 3,
    effective_at: '2026-12-01T00:00:00Z',
    updated_at: '2026-12-01T00:00:00Z',
    history: [
      { version: 2, effective_at: '2026-11-15T00:00:00Z' },
      { version: 1, effective_at: '2026-11-01T00:00:00Z' },
    ],
  }

  it('?v= 값 읽기', () => {
    expect(policyVersionParam('2')).toBe(2)
    expect(policyVersionParam(['4'])).toBe(4)
    for (const bad of [undefined, '', '0', '-1', '1.5', 'abc'])
      expect(policyVersionParam(bad)).toBeNull()
  })

  it.each([
    ['테마형', (p: SitePolicy) => <PolicyArticle policy={p} />],
    ['코드형', (p: SitePolicy) => <PolicyView policy={p} />],
  ])('%s — 버전 · 시행일 · 이전 버전 목록', (_kind, view) => {
    render(view(versioned))
    expect(screen.getByText('v3 · 시행일 2026.12.01')).toBeInTheDocument()
    const history = screen.getByRole('navigation', { name: '이전 버전' })
    const links = within(history).getAllByRole('link')
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['?v=2', '?v=1'])
    expect(links[0]).toHaveTextContent('v2 · 2026.11.15 시행')
    expect(screen.queryByRole('note')).not.toBeInTheDocument()
  })

  it.each([
    ['테마형', (p: SitePolicy) => <PolicyArticle policy={p} />],
    ['코드형', (p: SitePolicy) => <PolicyView policy={p} />],
  ])('%s — 이전 버전을 보면 안내와 지금 버전 링크', (_kind, view) => {
    render(view({ ...versioned, version: 2, archived: true }))
    expect(screen.getByRole('note')).toHaveTextContent('이전 버전이에요')
    expect(within(screen.getByRole('note')).getByRole('link', { name: '여기' })).toHaveAttribute(
      'href',
      '?'
    )
    expect(
      within(screen.getByRole('navigation', { name: '이전 버전' })).getByRole('link', {
        name: /v2/,
      })
    ).toHaveAttribute('aria-current', 'page')
  })

  it.each([
    ['테마형', (p: SitePolicy) => <PolicyArticle policy={p} />],
    ['코드형', (p: SitePolicy) => <PolicyView policy={p} />],
  ])('%s — 기본 문안은 버전 · 이전 버전 없이', (_kind, view) => {
    render(view({ ...policy, is_default: true, updated_at: null }))
    expect(screen.queryByText(/시행일/)).not.toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: '이전 버전' })).not.toBeInTheDocument()
  })
})
