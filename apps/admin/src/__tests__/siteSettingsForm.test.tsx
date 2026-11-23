import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouterProvider, createMemoryRouter } from 'react-router'
import { renderWithQuery } from './renderWithQuery'
import { SiteInfoPage } from '@/pages/SiteInfoPage'
import { api } from '@/lib/api'
import { weeklyRows } from '@/lib/siteHours'
import { useAuthStore } from '@/stores/authStore'

// 사이트 관리 → 사이트 기본정보 (T-036-A · T-221 · T-222, 사이트 관리 기획서 SM-01)

const SAVED = {
  id: 's1',
  tenant_id: 't1',
  site_name: null,
  company_name: null,
  phone: '02-1234-5678',
  cs_phone: null,
  fax: null,
  email: null,
  postal_code: null,
  address: '서울특별시 강남구 테헤란로 1',
  address_detail: null,
  hours_weekday: '09:00 - 18:00',
  hours_saturday: null,
  hours_note: null,
  hours_temp_note: null,
  weekly_hours: null,
  parking: null,
  ceo: '홍길동',
  business_number: null,
  mail_order_number: null,
  business_type: null,
  business_item: null,
  privacy_officer: null,
  privacy_email: null,
  copyright: null,
  logo_url: null,
  favicon_url: null,
  hidden_fields: [],
  updated_at: '2026-10-29T00:00:00Z',
}

const ok = (data: unknown) => ({ data: { success: true, data } })

const renderPage = () =>
  renderWithQuery(
    <RouterProvider
      router={createMemoryRouter(
        [
          { path: '/admin/site/info', element: <SiteInfoPage /> },
          { path: '/admin/dashboard', element: <p>대시보드</p> },
        ],
        { initialEntries: ['/admin/site/info'] }
      )}
    />
  )

const weekToggle = () => screen.findByRole('checkbox', { name: /요일별로 입력하기/ })
const saveButton = () => screen.getByRole('button', { name: '변경사항 저장' })

beforeEach(() => {
  vi.restoreAllMocks()
  useAuthStore.setState({
    user: { id: 'u', email: 'a@b.c', name: '관리자', role: 'TENANT_ADMIN', tenant_id: 't1' },
  } as never)
})

describe('사이트 기본정보', () => {
  it('비어 있는 핵심 항목을 위에 알리고, 누르면 그 칸으로 (T-230)', async () => {
    vi.spyOn(api, 'get').mockResolvedValue(ok(SAVED))
    const user = userEvent.setup()
    renderPage()
    const missing = await screen.findByRole('region', { name: /아직 비어 있는 항목/ })
    // 저장값: 전화 · 주소는 있고 사이트명 · 이메일 · 보호책임자는 비어 있다
    expect(
      within(missing)
        .getAllByRole('button')
        .map((b) => b.textContent)
    ).toEqual(['사이트명', '대표 이메일', '개인정보 보호책임자'])
    await user.click(within(missing).getByRole('button', { name: '대표 이메일' }))
    expect(screen.getByLabelText('대표 이메일')).toHaveFocus()
    // 입력하면 바로 목록에서 빠진다
    await user.type(screen.getByLabelText('대표 이메일'), 'a@b.c')
    expect(within(missing).queryByRole('button', { name: '대표 이메일' })).not.toBeInTheDocument()
  })

  it('푸터 미리보기는 따로 둔 칸에서 입력하는 대로 바뀐다 (T-230)', async () => {
    vi.spyOn(api, 'get').mockResolvedValue(ok(SAVED))
    const user = userEvent.setup()
    renderPage()
    const preview = await screen.findByRole('complementary', { name: '푸터 미리보기' })
    await user.type(screen.getByLabelText('사이트명'), '바른치과')
    expect(preview).toHaveTextContent('바른치과')
  })

  it('저장된 값을 불러오고, 고친 값만 바뀐 채 저장한다 (빈 칸은 "" 로 지우기)', async () => {
    vi.spyOn(api, 'get').mockResolvedValue(ok(SAVED))
    const put = vi
      .spyOn(api, 'put')
      .mockResolvedValue(ok({ ...SAVED, company_name: '주식회사 바른' }))
    const user = userEvent.setup()
    renderPage()

    expect(await screen.findByDisplayValue('02-1234-5678')).toBeInTheDocument()
    // 처음에는 바꾼 것이 없어 저장할 수 없다
    expect(saveButton()).toBeDisabled()
    expect(screen.getByLabelText('평일')).toHaveValue('09:00 - 18:00')
    await user.type(screen.getByLabelText('회사명 · 상호명'), '주식회사 바른')
    await user.clear(screen.getByLabelText('평일'))
    expect(screen.getByText('저장되지 않은 변경사항이 있습니다.')).toBeInTheDocument()
    await user.click(saveButton())

    await waitFor(() => expect(put).toHaveBeenCalled())
    const [url, body] = put.mock.calls[0]
    expect(url).toBe('/v1/site-settings')
    expect(body).toMatchObject({
      phone: '02-1234-5678',
      company_name: '주식회사 바른',
      hours_weekday: '',
      // 고객센터는 대표번호와 같음 · 요일별 표는 꺼짐 · 모두 공개
      cs_phone: '',
      weekly_hours: {},
      hidden_fields: [],
    })
  })

  it('처음이면 빈 폼', async () => {
    vi.spyOn(api, 'get').mockResolvedValue(ok(null))
    renderPage()
    expect(await screen.findByLabelText('대표 전화')).toHaveValue('')
    expect(screen.getByLabelText('사이트명')).toHaveValue('')
    expect(screen.getByText('로고')).toBeInTheDocument()
  })

  it('변경 취소는 저장된 값으로 되돌린다', async () => {
    vi.spyOn(api, 'get').mockResolvedValue(ok(SAVED))
    const user = userEvent.setup()
    renderPage()
    const ceo = await screen.findByRole('textbox', { name: '대표자' })
    await user.clear(ceo)
    await user.type(ceo, '김대표')
    await user.click(screen.getByRole('button', { name: '변경 취소' }))
    expect(ceo).toHaveValue('홍길동')
    expect(saveButton()).toBeDisabled()
  })

  it('고객센터 번호 — 대표번호와 동일을 끄면 따로 입력한다', async () => {
    vi.spyOn(api, 'get').mockResolvedValue(ok(SAVED))
    const put = vi.spyOn(api, 'put').mockResolvedValue(ok(SAVED))
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByLabelText('대표번호와 동일'))
    await user.type(screen.getByLabelText('고객센터 전화'), '1588-1234')
    await user.click(saveButton())
    await waitFor(() => expect(put).toHaveBeenCalled())
    expect(put.mock.calls[0][1]).toMatchObject({ cs_phone: '1588-1234' })
  })

  it('서버가 칸 오류를 주면 그 칸 아래에 보여 준다', async () => {
    vi.spyOn(api, 'get').mockResolvedValue(ok(SAVED))
    vi.spyOn(api, 'put').mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 400,
        data: {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            field: 'phone',
            message: '전화번호 형식을 확인해 주세요. (예: 02-1234-5678)',
          },
        },
      },
    })
    const user = userEvent.setup()
    renderPage()
    const phone = await screen.findByLabelText('대표 전화')
    await user.clear(phone)
    await user.type(phone, '전화주세요')
    await user.click(saveButton())

    await waitFor(() => expect(phone).toHaveAttribute('aria-invalid', 'true'))
    expect(phone).toHaveAccessibleDescription(/전화번호 형식을 확인해 주세요/)
    // 고치기 시작하면 오류 안내가 사라진다
    await user.type(phone, '1')
    expect(phone).toHaveAttribute('aria-invalid', 'false')
  })
})

describe('요일별 운영시간', () => {
  it('켜면 월~금 9~6시 · 주말 휴무로 시작하고, 한 요일을 모든 요일에 복사한다', async () => {
    vi.spyOn(api, 'get').mockResolvedValue(ok(SAVED))
    const put = vi.spyOn(api, 'put').mockResolvedValue(ok(SAVED))
    const user = userEvent.setup()
    renderPage()
    await user.click(await weekToggle())
    // 예전 평일 · 토요일 칸 대신 표
    expect(screen.queryByLabelText('평일')).not.toBeInTheDocument()
    expect(screen.getByLabelText('월요일 운영 상태')).toHaveValue('open')
    expect(screen.getByLabelText('일요일 운영 상태')).toHaveValue('closed')
    expect(screen.getByLabelText('일요일 여는 시각')).toBeDisabled()

    await user.selectOptions(screen.getByLabelText('토요일 운영 상태'), 'open')
    expect(screen.getByLabelText('토요일 여는 시각')).toHaveValue('09:00')
    await user.click(screen.getByRole('button', { name: '월요일 시간을 모든 요일에 복사' }))
    expect(screen.getByLabelText('일요일 운영 상태')).toHaveValue('open')

    const preview = screen.getByTestId('footer-preview')
    expect(preview).toHaveTextContent('월~일 09:00 ~ 18:00')

    await user.click(saveButton())
    await waitFor(() => expect(put).toHaveBeenCalled())
    const body = put.mock.calls[0][1] as { weekly_hours: Record<string, { status: string }> }
    expect(Object.keys(body.weekly_hours)).toEqual([
      'mon',
      'tue',
      'wed',
      'thu',
      'fri',
      'sat',
      'sun',
    ])
    expect(body.weekly_hours.sun.status).toBe('open')
  })

  it('저장된 표를 불러오고, 끄면 {} 로 지운다', async () => {
    const week = {
      mon: { status: 'open', open: '10:00', close: '19:00', break_start: null, break_end: null },
    }
    vi.spyOn(api, 'get').mockResolvedValue(ok({ ...SAVED, weekly_hours: week }))
    const put = vi.spyOn(api, 'put').mockResolvedValue(ok(SAVED))
    const user = userEvent.setup()
    renderPage()
    expect(await screen.findByLabelText('월요일 여는 시각')).toHaveValue('10:00')
    await user.click(await weekToggle())
    expect(screen.getByLabelText('평일')).toHaveValue('09:00 - 18:00')
    await user.click(saveButton())
    await waitFor(() => expect(put).toHaveBeenCalled())
    expect(put.mock.calls[0][1]).toMatchObject({ weekly_hours: {} })
  })

  it('요일 시간 오류는 그 요일 이름과 함께 표 아래에', async () => {
    vi.spyOn(api, 'get').mockResolvedValue(ok(SAVED))
    vi.spyOn(api, 'put').mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 400,
        data: {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            field: 'weekly_hours.tue',
            message: '점심시간은 영업시간 안에 있어야 해요.',
          },
        },
      },
    })
    const user = userEvent.setup()
    renderPage()
    await user.click(await weekToggle())
    await user.click(saveButton())
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '화요일: 점심시간은 영업시간 안에 있어야 해요.'
    )
  })

  it('미리보기 글자 — 이어지는 같은 시간은 묶는다', () => {
    const open = {
      status: 'open' as const,
      open: '09:00',
      close: '18:00',
      break_start: null,
      break_end: null,
    }
    expect(
      weeklyRows({ mon: open, tue: open, sat: { ...open, close: '02:00', open: '18:00' } })
    ).toEqual([
      { days: '월~화', time: '09:00 ~ 18:00' },
      { days: '토', time: '18:00 ~ 다음 날 02:00' },
    ])
  })
})

describe('공개 항목 선택 · 푸터 미리보기', () => {
  it('끈 항목은 미리보기에서 빠지고 hidden_fields 로 저장된다', async () => {
    vi.spyOn(api, 'get').mockResolvedValue(
      ok({ ...SAVED, company_name: '주식회사 바른', business_number: '123-45-67890' })
    )
    const put = vi.spyOn(api, 'put').mockResolvedValue(ok(SAVED))
    const user = userEvent.setup()
    renderPage()
    const preview = await screen.findByTestId('footer-preview')
    expect(preview).toHaveTextContent('주식회사 바른 | 대표자 홍길동 | 사업자등록번호 123-45-67890')
    expect(preview).toHaveTextContent('TEL 02-1234-5678')

    const choices = screen.getByRole('group', { name: '홈페이지에 보일 항목' })
    await user.click(within(choices).getByLabelText('대표자'))
    await user.click(within(choices).getByLabelText('전화번호'))
    expect(preview).not.toHaveTextContent('홍길동')
    expect(preview).not.toHaveTextContent('02-1234-5678')

    await user.click(saveButton())
    await waitFor(() => expect(put).toHaveBeenCalled())
    expect(put.mock.calls[0][1]).toMatchObject({ hidden_fields: ['ceo', 'phone'] })
  })

  it('저장된 숨김을 불러온다', async () => {
    vi.spyOn(api, 'get').mockResolvedValue(ok({ ...SAVED, hidden_fields: ['address'] }))
    renderPage()
    const choices = await screen.findByRole('group', { name: '홈페이지에 보일 항목' })
    expect(within(choices).getByLabelText('주소')).not.toBeChecked()
    expect(within(choices).getByLabelText('대표자')).toBeChecked()
    expect(screen.getByTestId('footer-preview')).not.toHaveTextContent('테헤란로')
  })
})
