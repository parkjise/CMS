import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { Footer } from '@/components/layout/Footer'
import { FloatingButtons } from '@/components/layout/FloatingButtons'
import { useClientAuthStore } from '@/lib/authStore'
import { useEditStore } from '@/lib/editStore'
import type { PublicSnsSettings } from '@/lib/publicSite.types'

// SNS 노출 위치 (T-038-A, 기획서 AD-03) — 푸터 아이콘 · 카카오톡 플로팅

const sns = (over: Partial<PublicSnsSettings> = {}): PublicSnsSettings => ({
  kakao_url: 'https://pf.kakao.com/_a',
  instagram_url: 'https://instagram.com/a',
  facebook_url: null,
  youtube_url: null,
  blog_url: null,
  naver_url: null,
  ...over,
})

beforeEach(() => {
  useClientAuthStore.setState({ isLoggedIn: false })
  useEditStore.setState({ isEditMode: false })
})
afterEach(cleanup)

describe('Footer SNS 아이콘', () => {
  it('기본(예전 응답 · 켜짐)은 아이콘 노출', () => {
    render(<Footer tenantName="가게" sns={sns()} />)
    expect(screen.getByRole('link', { name: '인스타그램' })).toBeInTheDocument()
    cleanup()
    render(<Footer tenantName="가게" sns={sns({ show_in_footer: true })} />)
    expect(screen.getByRole('link', { name: '인스타그램' })).toBeInTheDocument()
  })

  it('푸터 노출을 끄면 아이콘이 없다', () => {
    render(<Footer tenantName="가게" sns={sns({ show_in_footer: false })} />)
    expect(screen.queryByRole('link', { name: '인스타그램' })).toBeNull()
    expect(screen.getByText('가게')).toBeInTheDocument()
  })
})

describe('카카오톡 플로팅 버튼', () => {
  it('기본은 우측 하단에 보인다', () => {
    render(<FloatingButtons tenantSlug="shop" kakaoUrl="https://pf.kakao.com/_a" />)
    expect(screen.getByRole('link', { name: '카카오톡 채널' })).toBeInTheDocument()
    expect(screen.queryByTestId('kakao-left')).toBeNull()
  })

  it('플로팅 노출을 끄면 카카오톡 버튼만 사라진다', () => {
    render(
      <FloatingButtons tenantSlug="shop" kakaoUrl="https://pf.kakao.com/_a" showKakao={false} />,
    )
    expect(screen.queryByRole('link', { name: '카카오톡 채널' })).toBeNull()
    // 관리자 로그인 버튼은 그대로
    expect(screen.getByRole('button', { name: /관리자 로그인|로딩 중/ })).toBeInTheDocument()
  })

  it('좌측 하단을 고르면 왼쪽에 따로 띄운다', () => {
    render(
      <FloatingButtons
        tenantSlug="shop"
        kakaoUrl="https://pf.kakao.com/_a"
        kakaoPosition="BOTTOM_LEFT"
      />,
    )
    const left = screen.getByTestId('kakao-left')
    expect(left.className).toContain('left-6')
    expect(left).toContainElement(screen.getByRole('link', { name: '카카오톡 채널' }))
  })

  it('카카오톡 주소가 없으면 설정과 상관없이 없다', () => {
    render(<FloatingButtons tenantSlug="shop" kakaoUrl={null} kakaoPosition="BOTTOM_LEFT" />)
    expect(screen.queryByRole('link', { name: '카카오톡 채널' })).toBeNull()
  })
})
