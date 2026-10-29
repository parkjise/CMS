import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { Footer } from '@/components/layout/Footer'
import { Navbar } from '@/components/layout/Navbar'
import type { PublicSiteSettings } from '@/lib/publicSite.types'

// 관리자 공통 설정 → 테마형 홈페이지 푸터 · 로고 (T-036-A)

const EMPTY: PublicSiteSettings = {
  phone: null,
  email: null,
  address: null,
  address_detail: null,
  hours_weekday: null,
  hours_saturday: null,
  hours_note: null,
  parking: null,
  ceo: null,
  business_number: null,
  logo_url: null,
  favicon_url: null,
}

describe('테마형 푸터 사업체 정보', () => {
  it('입력한 연락처 · 주소 · 영업시간 · 사업자 정보를 보여 준다', () => {
    render(
      <Footer
        tenantName="OO의원"
        sns={null}
        info={{
          ...EMPTY,
          phone: '02-1234-5678',
          email: 'hello@clinic.kr',
          address: '서울 강남구 테헤란로 1',
          address_detail: '3층',
          hours_weekday: '09:00 - 18:00',
          hours_note: '일요일 휴무',
          ceo: '홍길동',
          business_number: '123-45-67890',
        }}
      />,
    )
    const info = screen.getByTestId('footer-business-info')
    expect(within(info).getByRole('link', { name: 'TEL 02-1234-5678' })).toHaveAttribute(
      'href',
      'tel:0212345678',
    )
    expect(within(info).getByRole('link', { name: 'hello@clinic.kr' })).toHaveAttribute(
      'href',
      'mailto:hello@clinic.kr',
    )
    expect(info).toHaveTextContent('서울 강남구 테헤란로 1 3층')
    expect(info).toHaveTextContent('평일 09:00 - 18:00 · 일요일 휴무')
    expect(info).toHaveTextContent('OO의원 | 대표자 홍길동 | 사업자등록번호 123-45-67890')
  })

  it('공통 설정이 비어 있거나 없으면 사업체 정보 줄을 그리지 않는다', () => {
    const { rerender } = render(<Footer tenantName="OO의원" sns={null} info={EMPTY} />)
    expect(screen.queryByTestId('footer-business-info')).not.toBeInTheDocument()
    rerender(<Footer tenantName="OO의원" sns={null} />)
    expect(screen.queryByTestId('footer-business-info')).not.toBeInTheDocument()
  })
})

describe('테마형 상단 로고', () => {
  it('로고가 있으면 이미지, 없으면 상호 글자', () => {
    const { rerender } = render(
      <Navbar tenantName="OO의원" logoUrl="https://cdn/logo.webp" sections={[]} />,
    )
    const home = screen.getByRole('button', { name: 'OO의원 홈으로 이동' })
    expect(home.querySelector('img')).toHaveAttribute('src', 'https://cdn/logo.webp')
    expect(home).not.toHaveTextContent('OO의원')

    rerender(<Navbar tenantName="OO의원" sections={[]} />)
    expect(screen.getByRole('button', { name: 'OO의원 홈으로 이동' })).toHaveTextContent('OO의원')
  })
})
