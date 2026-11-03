import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { Location } from '@/templates/hospital-a/components/sub/Location'
import { COMMON_SETTINGS_URL } from '@/templates/shared/CommonSettingsHint'
import { useEditStore } from '@/lib/editStore'
import type { PublicSection } from '@/lib/publicSite.types'

// 오시는 길 — 주소 · 전화 · 주차 · 운영 시간은 공통 설정이 먼저, 비었으면 섹션 샘플 값 (T-125-F)

const section = {
  id: 'map-1',
  section_type: 'MAP',
  label: '오시는 길',
  display_order: 0,
  is_active: true,
  settings: [
    { field_key: 'title', field_value: '오시는 길', value_type: 'STRING' },
    { field_key: 'address', field_value: '샘플시 샘플구 1', value_type: 'STRING' },
    { field_key: 'phone', field_value: '02-0000-0000', value_type: 'STRING' },
    { field_key: 'parking', field_value: '샘플 주차', value_type: 'STRING' },
    { field_key: 'transit', field_value: '2호선 강남역 도보 5분', value_type: 'STRING' },
  ],
} as PublicSection

const row = (label: string) => screen.getByText(label, { selector: 'dt' }).parentElement as HTMLElement

describe('Location (오시는 길)', () => {
  beforeEach(() => useEditStore.setState({ isEditMode: false, isPreview: false, pendingChanges: {} }))
  afterEach(cleanup)

  it('공통 설정 값이 있으면 그 값을 쓴다 — 주소(상세 포함) · 전화 · 주차 · 운영 시간', () => {
    render(
      <Location
        section={section}
        tenantSlug="t"
        editable
        business={{
          address: '서울시 중구 세종대로 1 2층',
          phone: '02-111-2222',
          parking: '전용 주차장 10대',
          hours_weekday: '09:00 - 18:00',
          hours_saturday: '09:00 - 13:00',
          hours_note: '일요일 휴무',
        }}
      />,
    )
    expect(within(row('주소')).getByText('서울시 중구 세종대로 1 2층')).toBeInTheDocument()
    expect(within(row('대표전화')).getByRole('link', { name: '02-111-2222' })).toHaveAttribute('href', 'tel:021112222')
    expect(within(row('주차')).getByText('전용 주차장 10대')).toBeInTheDocument()
    const hours = row('운영 시간')
    expect(hours).toHaveTextContent('평일 09:00 - 18:00')
    expect(hours).toHaveTextContent('토요일 09:00 - 13:00')
    expect(hours).toHaveTextContent('일요일 휴무')
    expect(screen.queryByText('샘플시 샘플구 1')).toBeNull()
  })

  it('공통 설정이 비어 있으면 섹션 샘플 값 · 운영 시간 줄은 없음', () => {
    render(<Location section={section} tenantSlug="t" editable business={{ address: '', phone: '' }} />)
    expect(within(row('주소')).getByText('샘플시 샘플구 1')).toBeInTheDocument()
    expect(within(row('대표전화')).getByText('02-0000-0000')).toBeInTheDocument()
    expect(within(row('주차')).getByText('샘플 주차')).toBeInTheDocument()
    expect(screen.queryByText('운영 시간', { selector: 'dt' })).toBeNull()
    expect(within(row('대중교통')).getByText('2호선 강남역 도보 5분')).toBeInTheDocument()
  })

  it('편집 모드 — 공통 설정 안내 · 링크, 대중교통은 바로 고치는 글자', () => {
    useEditStore.setState({ isEditMode: true })
    render(<Location section={section} tenantSlug="t" editable business={{}} />)
    expect(screen.getByRole('link', { name: /공통 설정 열기/ })).toHaveAttribute('href', COMMON_SETTINGS_URL)
    expect(COMMON_SETTINGS_URL).toMatch(/\/admin\/content\?tab=settings$/)
    expect(within(row('대중교통')).getByText('2호선 강남역 도보 5분')).toHaveAttribute('data-editable', 'text')
  })

  it('방문자 화면 · 샘플 섹션에는 안내가 없다', () => {
    render(<Location section={section} tenantSlug="t" editable business={{}} />)
    expect(screen.queryByText(/공통 설정 열기/)).toBeNull()
    cleanup()
    useEditStore.setState({ isEditMode: true })
    render(<Location section={section} tenantSlug="t" editable={false} business={{}} />)
    expect(screen.queryByText(/공통 설정 열기/)).toBeNull()
  })
})
