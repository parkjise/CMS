import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import type { WeeklyHours } from '@cms/types'
import { Footer } from '@/components/layout/Footer'
import { buildLocalBusinessJsonLd } from '@/lib/jsonLd'
import type { PublicSection, PublicSite, PublicSiteSettings } from '@/lib/publicSite.types'
import { dayTime, hoursRows, openingHoursSpecification, weeklyRows } from '@/lib/siteHours'
import { Footer as HospitalFooter } from '@/templates/hospital-a/components/Footer'
import { Location } from '@/templates/hospital-a/components/sub/Location'
import { hospitalASample } from '@/templates/hospital-a/sample-content'
import { resolveSiteInfo } from '@/templates/shared/resolveSections'

// 사이트 기본정보 확장 · 공개 항목 선택이 홈페이지에 나가는 모습 (T-222)

afterEach(cleanup)

const open = (o: string, c: string, bs: string | null = null, be: string | null = null) => ({
  status: 'open' as const,
  open: o,
  close: c,
  break_start: bs,
  break_end: be,
})
const closed = {
  status: 'closed' as const,
  open: null,
  close: null,
  break_start: null,
  break_end: null,
}
const allDay = {
  status: '24h' as const,
  open: null,
  close: null,
  break_start: null,
  break_end: null,
}

const WEEK: WeeklyHours = {
  mon: open('09:00', '18:00', '12:00', '13:00'),
  tue: open('09:00', '18:00', '12:00', '13:00'),
  wed: open('09:00', '18:00', '12:00', '13:00'),
  thu: open('09:00', '18:00', '12:00', '13:00'),
  fri: open('09:00', '18:00', '12:00', '13:00'),
  sat: open('10:00', '14:00'),
  sun: closed,
}

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

const site = (info: Partial<PublicSiteSettings>, sections: unknown[] = []) =>
  ({
    tenant: { id: 't', slug: 'clinic', name: '바른치과', template_type: 'HOSPITAL' },
    sections,
    seo_settings: null,
    sns_settings: null,
    site_settings: { ...EMPTY, ...info },
    template: null,
  }) as unknown as PublicSite

const MAP_SECTION = {
  id: 'map-1',
  section_type: 'MAP',
  label: '오시는 길',
  display_order: 0,
  is_active: true,
  settings: [
    { field_key: 'address', field_value: '섹션시 섹션구 1', value_type: 'STRING' },
    { field_key: 'phone', field_value: '02-0000-0000', value_type: 'STRING' },
    { field_key: 'latitude', field_value: '37.5', value_type: 'STRING' },
    { field_key: 'longitude', field_value: '127.0', value_type: 'STRING' },
    { field_key: 'map_embed_url', field_value: 'https://map.example/embed', value_type: 'STRING' },
  ],
} as PublicSection

describe('요일별 운영시간 글자', () => {
  it('이어지는 같은 시간은 한 줄로 — 월~금 · 토 · 일', () => {
    expect(weeklyRows(WEEK)).toEqual([
      { days: '월~금', time: '09:00 ~ 18:00 (점심 12:00 ~ 13:00)' },
      { days: '토', time: '10:00 ~ 14:00' },
      { days: '일', time: '휴무' },
    ])
  })

  it('정하지 않은 요일은 묶음을 끊는다', () => {
    expect(weeklyRows({ mon: open('09:00', '18:00'), wed: open('09:00', '18:00') })).toEqual([
      { days: '월', time: '09:00 ~ 18:00' },
      { days: '수', time: '09:00 ~ 18:00' },
    ])
  })

  it('다음 날 새벽에 닫음 · 24시간', () => {
    expect(dayTime(open('18:00', '02:00'))).toBe('18:00 ~ 다음 날 02:00')
    expect(dayTime(open('10:00', '24:00'))).toBe('10:00 ~ 24:00')
    expect(dayTime(allDay)).toBe('24시간')
  })

  it('요일별 표가 없으면 예전 평일 · 토요일 글자', () => {
    expect(hoursRows({ weekly_hours: null, hours_weekday: '9-6', hours_saturday: '9-1' })).toEqual([
      { days: '평일', time: '9-6' },
      { days: '토요일', time: '9-1' },
    ])
    expect(hoursRows({ weekly_hours: {}, hours_weekday: '9-6' })).toEqual([
      { days: '평일', time: '9-6' },
    ])
    // 표가 있으면 예전 글자는 쓰지 않는다
    expect(hoursRows({ weekly_hours: { sun: closed }, hours_weekday: '9-6' })).toEqual([
      { days: '일', time: '휴무' },
    ])
  })
})

describe('사업체 구조화 데이터', () => {
  it('점심시간은 둘로 나누고 같은 시간 요일은 묶는다 · 휴무는 뺀다', () => {
    const spec = openingHoursSpecification({ ...WEEK, thu: allDay })
    expect(spec).toEqual([
      {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Friday'],
        opens: '09:00',
        closes: '12:00',
      },
      {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Friday'],
        opens: '13:00',
        closes: '18:00',
      },
      {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: 'Thursday',
        opens: '00:00',
        closes: '23:59',
      },
      {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: 'Saturday',
        opens: '10:00',
        closes: '14:00',
      },
    ])
  })

  it('요일별 시간 · 회사명 · 팩스 · 우편번호를 넣는다', () => {
    const jsonLd = buildLocalBusinessJsonLd(
      site({
        weekly_hours: WEEK,
        company_name: '주식회사 바른',
        fax: '02-1234-5679',
        postal_code: '06236',
        address: '서울 강남구 테헤란로 1',
      })
    )
    expect(jsonLd.legalName).toBe('주식회사 바른')
    expect(jsonLd.faxNumber).toBe('02-1234-5679')
    expect(jsonLd.address).toMatchObject({ postalCode: '06236' })
    expect(jsonLd.openingHoursSpecification).toHaveLength(3)
  })

  it('예전 자유 글자만 있으면 운영시간을 넣지 않는다', () => {
    const jsonLd = buildLocalBusinessJsonLd(site({ hours_weekday: '09:00 - 18:00' }))
    expect(jsonLd.openingHoursSpecification).toBeUndefined()
  })

  it('주소를 숨겼으면 오시는 길 섹션의 주소 · 좌표로 대신 채우지 않는다', () => {
    const shown = buildLocalBusinessJsonLd(site({}, [MAP_SECTION]))
    expect(shown.address).toMatchObject({ streetAddress: '섹션시 섹션구 1' })
    const hidden = buildLocalBusinessJsonLd(site({ hidden_fields: ['address'] }, [MAP_SECTION]))
    expect(hidden.address).toBeUndefined()
    expect(hidden.geo).toBeUndefined()
    expect(JSON.stringify(hidden)).not.toContain('섹션시')
  })
})

describe('테마형 푸터', () => {
  it('새 칸 · 요일별 시간 · 저작권 문구를 보여 준다', () => {
    render(
      <Footer
        tenantName="바른치과"
        sns={null}
        info={{
          ...EMPTY,
          company_name: '주식회사 바른',
          ceo: '홍길동',
          business_number: '123-45-67890',
          mail_order_number: '제2026-서울강남-00000호',
          business_type: '보건업',
          business_item: '치과의원',
          phone: '02-1234-5678',
          cs_phone: '1588-1234',
          fax: '02-1234-5679',
          postal_code: '06236',
          address: '서울 강남구 테헤란로 1',
          weekly_hours: WEEK,
          hours_temp_note: '설 연휴 휴진',
          privacy_officer: '개인정보팀',
          privacy_email: 'privacy@clinic.kr',
          copyright: '© 바른. All rights reserved.',
        }}
      />
    )
    const info = screen.getByTestId('footer-business-info')
    expect(within(info).getByRole('link', { name: '고객센터 1588-1234' })).toHaveAttribute(
      'href',
      'tel:15881234'
    )
    expect(info).toHaveTextContent('FAX 02-1234-5679')
    expect(info).toHaveTextContent('(06236) 서울 강남구 테헤란로 1')
    expect(info).toHaveTextContent(
      '월~금 09:00 ~ 18:00 (점심 12:00 ~ 13:00) · 토 10:00 ~ 14:00 · 일 휴무 · 설 연휴 휴진'
    )
    expect(info).toHaveTextContent('주식회사 바른 | 대표자 홍길동')
    expect(info).toHaveTextContent('통신판매업 신고번호 제2026-서울강남-00000호')
    expect(info).toHaveTextContent('업태 · 종목 보건업 / 치과의원')
    expect(info).toHaveTextContent('개인정보 보호책임자 개인정보팀 (privacy@clinic.kr)')
    expect(screen.getByText('© 바른. All rights reserved.')).toBeInTheDocument()
  })

  it('숨긴 항목(null)은 그리지 않는다', () => {
    render(
      <Footer
        tenantName="바른치과"
        sns={null}
        info={{ ...EMPTY, hidden_fields: ['ceo'], phone: '02-1' }}
      />
    )
    expect(screen.getByTestId('footer-business-info')).not.toHaveTextContent('대표자')
  })
})

describe('코드형(hospital-a) 푸터 · 오시는 길', () => {
  const resolved = (info: Partial<PublicSiteSettings>) =>
    resolveSiteInfo(hospitalASample, site(info))

  it('요일별 시간 줄 · 새 칸 · 저작권 문구', () => {
    render(
      <HospitalFooter
        info={resolved({
          weekly_hours: WEEK,
          company_name: '주식회사 바른',
          mail_order_number: '제2026-서울강남-00000호',
          fax: '02-1234-5679',
          hours_temp_note: '설 연휴 휴진',
          copyright: '© 바른',
        })}
      />
    )
    const hours = screen.getByRole('heading', { name: '운영 시간' }).parentElement as HTMLElement
    expect(within(hours).getByText('월~금')).toBeInTheDocument()
    expect(within(hours).getByText('10:00 ~ 14:00')).toBeInTheDocument()
    expect(within(hours).getByText('설 연휴 휴진')).toBeInTheDocument()
    expect(screen.getByText('주식회사 바른')).toBeInTheDocument()
    expect(screen.getByText('통신판매업 신고번호 제2026-서울강남-00000호')).toBeInTheDocument()
    expect(screen.getByText('FAX 02-1234-5679')).toBeInTheDocument()
    expect(screen.getByText('© 바른')).toBeInTheDocument()
  })

  it('요일별 표가 없으면 예전 평일 · 토요일 글자 그대로', () => {
    render(<HospitalFooter info={resolved({ hours_weekday: '09:00 - 18:00' })} />)
    const hours = screen.getByRole('heading', { name: '운영 시간' }).parentElement as HTMLElement
    // 두 글자 요일 이름은 예전처럼 자간을 넓혀 줄을 맞춘다
    expect(within(hours).getByText('평일')).toHaveClass('footer__hours-day--spaced')
    expect(within(hours).getByText('09:00 - 18:00')).toBeInTheDocument()
  })

  it('숨긴 주소 · 전화는 오시는 길 섹션 값으로 대신 채우지 않고, 지도도 그리지 않는다', () => {
    const { container } = render(
      <Location
        section={MAP_SECTION}
        tenantSlug="t"
        editable={false}
        business={resolved({ hidden_fields: ['address', 'phone'] })}
      />
    )
    expect(container).not.toHaveTextContent('섹션시 섹션구 1')
    expect(container).not.toHaveTextContent('02-0000-0000')
    expect(container.querySelector('iframe')).toBeNull()
  })

  it('숨기지 않았으면 예전처럼 섹션 값으로 채운다', () => {
    const { container } = render(
      <Location section={MAP_SECTION} tenantSlug="t" editable={false} business={resolved({})} />
    )
    expect(container).toHaveTextContent('섹션시 섹션구 1')
    expect(container.querySelector('iframe')).not.toBeNull()
  })
})
