import { afterEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Header } from '@/templates/hospital-a/components/Header'
import { useMemberStore } from '@/lib/memberStore'

const brand = '아주긴상호명으로등록된우리동네가족건강의원'
const props = {
  brandName: brand,
  logoUrl: '',
  homeHref: '/demo',
  tenantSlug: 'demo',
  menu: [{ href: '/demo/notice', title: '공지사항' }],
  account: [
    { href: '/demo/member/login', title: '로그인' },
    { href: '/demo/member/join', title: '회원가입' },
  ],
}
const initial = useMemberStore.getState()
afterEach(() => useMemberStore.setState(initial, true))

describe('헤더 상호 표시', () => {
  it.each(['', '/logo.svg'])(
    '로고 %s 여부와 무관하게 전체 상호와 홈 링크를 유지한다',
    (logoUrl) => {
      const { container } = render(<Header {...props} logoUrl={logoUrl} />)
      const link = screen.getByRole('link', { name: brand })
      expect(link).toHaveAttribute('href', '/demo')
      expect(link.querySelector('.header__brand')).toHaveTextContent(brand)
      expect(link.querySelector('.header__brand')).toHaveAttribute('title', brand)
      expect(container.querySelectorAll('.header__logo-image')).toHaveLength(logoUrl ? 1 : 0)
      expect(screen.getByRole('link', { name: '로그인' })).toHaveAttribute(
        'href',
        '/demo/member/login'
      )
      expect(screen.getByRole('link', { name: '회원가입' })).toHaveAttribute(
        'href',
        '/demo/member/join'
      )
    }
  )
  it('회원 기능을 끄면 상호와 메뉴는 유지하고 계정 링크를 숨긴다', () => {
    render(<Header {...props} memberEnabled={false} />)
    expect(screen.getByRole('link', { name: brand })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '전체 메뉴 열기' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '로그인' })).not.toBeInTheDocument()
  })
  it('방문자 회원의 마이페이지/로그아웃 메뉴를 유지한다', () => {
    useMemberStore.setState({ slug: 'demo', member: { id: 'm1', name: '방문자' } } as never)
    render(<Header {...props} />)
    expect(screen.getByRole('link', { name: '마이페이지' })).toHaveAttribute(
      'href',
      '/demo/member/mypage'
    )
    expect(screen.getByRole('button', { name: '로그아웃' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '로그인' })).not.toBeInTheDocument()
  })
})
