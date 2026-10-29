import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithQuery } from './renderWithQuery'
import { SiteSettingsForm } from '@/components/content/SiteSettingsForm'
import { api } from '@/lib/api'

// 콘텐츠 편집 → 공통 설정 (T-036-A)

const SAVED = {
  id: 's1',
  tenant_id: 't1',
  phone: '02-1234-5678',
  email: null,
  address: '서울특별시 강남구 테헤란로 1',
  address_detail: null,
  hours_weekday: '09:00 - 18:00',
  hours_saturday: null,
  hours_note: null,
  parking: null,
  ceo: null,
  business_number: null,
  logo_url: null,
  favicon_url: null,
  updated_at: '2026-10-29T00:00:00Z',
}

const ok = (data: unknown) => ({ data: { success: true, data } })

beforeEach(() => vi.restoreAllMocks())

describe('SiteSettingsForm', () => {
  it('저장된 값을 불러오고, 고친 값을 저장한다 (빈 칸은 "" 로 지우기)', async () => {
    vi.spyOn(api, 'get').mockResolvedValue(ok(SAVED))
    const put = vi.spyOn(api, 'put').mockResolvedValue(ok({ ...SAVED, ceo: '홍길동' }))
    const user = userEvent.setup()
    renderWithQuery(<SiteSettingsForm />)

    expect(await screen.findByDisplayValue('02-1234-5678')).toBeInTheDocument()
    expect(screen.getByLabelText('평일')).toHaveValue('09:00 - 18:00')
    await user.type(screen.getByLabelText('대표자'), '홍길동')
    await user.clear(screen.getByLabelText('평일'))
    await user.click(screen.getByRole('button', { name: '공통 설정 저장' }))

    await waitFor(() => expect(put).toHaveBeenCalled())
    const [url, body] = put.mock.calls[0]
    expect(url).toBe('/v1/site-settings')
    expect(body).toMatchObject({ phone: '02-1234-5678', ceo: '홍길동', hours_weekday: '' })
  })

  it('처음이면 빈 폼', async () => {
    vi.spyOn(api, 'get').mockResolvedValue(ok(null))
    renderWithQuery(<SiteSettingsForm />)
    expect(await screen.findByLabelText('대표 전화')).toHaveValue('')
    expect(screen.getByText('로고')).toBeInTheDocument()
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
    renderWithQuery(<SiteSettingsForm />)
    const phone = await screen.findByLabelText('대표 전화')
    await user.clear(phone)
    await user.type(phone, '전화주세요')
    await user.click(screen.getByRole('button', { name: '공통 설정 저장' }))

    await waitFor(() => expect(phone).toHaveAttribute('aria-invalid', 'true'))
    expect(phone).toHaveAccessibleDescription(/전화번호 형식을 확인해 주세요/)
    // 고치기 시작하면 오류 안내가 사라진다
    await user.type(phone, '1')
    expect(phone).toHaveAttribute('aria-invalid', 'false')
  })
})
