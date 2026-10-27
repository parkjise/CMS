import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { toast } from 'sonner'
import { publicApi } from '@/lib/api'
import { ContactForm } from '@/components/sections/ContactForm'
import {
  buildDetailSchema,
  toDetailPayload,
  type InquiryField,
  type InquiryFormConfig,
} from '@/lib/inquiryFields'
import type { PublicSection } from '@/lib/publicSite.types'

/** 업종별 문의 폼 칸 (T-051-A) */

vi.mock('@/lib/api', () => ({ publicApi: { get: vi.fn(), post: vi.fn() } }))
vi.mock('@/lib/recaptcha', () => ({ executeRecaptcha: vi.fn(async () => null) }))
vi.mock('@/lib/memberStore', () => ({ memberAuthHeader: vi.fn(async () => ({})) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const api = vi.mocked(publicApi)

const field = (over: Partial<InquiryField> & Pick<InquiryField, 'key' | 'label' | 'type'>) =>
  ({
    options: [],
    min: null,
    max: null,
    max_length: null,
    max_selected: null,
    placeholder: null,
    ...over,
  }) as InquiryField

const HOSPITAL: InquiryFormConfig = {
  inquiry_types: [
    { value: 'GENERAL', label: '일반 문의' },
    { value: 'RESERVATION', label: '예약 문의' },
    { value: 'SYMPTOM', label: '증상 문의' },
  ],
  fields: [
    field({
      key: 'department',
      label: '진료과',
      type: 'select',
      options: [
        { value: 'INTERNAL', label: '내과' },
        { value: 'DENTAL', label: '치과' },
      ],
    }),
    field({
      key: 'symptoms',
      label: '증상',
      type: 'multiselect',
      max_selected: 10,
      options: [
        { value: 'PAIN', label: '통증' },
        { value: 'FEVER', label: '발열' },
      ],
    }),
  ],
}

const PENSION: InquiryFormConfig = {
  inquiry_types: [
    { value: 'GENERAL', label: '일반 문의' },
    { value: 'RESERVATION', label: '예약 문의' },
  ],
  fields: [
    field({ key: 'check_in', label: '체크인', type: 'date' }),
    field({ key: 'check_out', label: '체크아웃', type: 'date' }),
    field({ key: 'adults', label: '성인', type: 'number', min: 1, max: 30 }),
  ],
}

const section: PublicSection = {
  id: 'sec-1',
  section_type: 'CONTACT',
  label: '문의',
  display_order: 1,
  is_active: true,
  settings: [],
}

const mockConfig = (config: InquiryFormConfig) =>
  api.get.mockResolvedValue({ data: { data: config } })

const fillBase = () => {
  fireEvent.change(screen.getByLabelText(/이름/), { target: { value: '홍길동' } })
  fireEvent.change(screen.getByLabelText(/휴대폰 번호/), {
    target: { value: '010-1234-5678' },
  })
  fireEvent.change(screen.getByLabelText(/문의 내용/), {
    target: { value: '업종별 문의 칸 테스트입니다.' },
  })
}

const submit = () => fireEvent.click(screen.getByRole('button', { name: /문의 보내기/ }))

beforeEach(() => {
  vi.clearAllMocks()
  api.post.mockResolvedValue({ data: { success: true } })
})

describe('ContactForm 업종별 칸', () => {
  it('병원 칸 목록을 받아 진료과 · 증상 칸과 증상 문의 유형을 보여 준다', async () => {
    mockConfig(HOSPITAL)
    render(<ContactForm section={section} tenantSlug="clinic" />)

    expect(await screen.findByLabelText('진료과')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: '통증' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: '증상 문의' })).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith('/inquiries/fields', {
      params: { tenant_slug: 'clinic' },
    })
  })

  it('펜션은 증상 문의 없이 날짜 · 인원 칸을 보여 준다', async () => {
    mockConfig(PENSION)
    render(<ContactForm section={section} tenantSlug="pension" />)

    expect(await screen.findByLabelText('체크인')).toHaveAttribute('type', 'date')
    expect(screen.getByLabelText('성인')).toHaveAttribute('type', 'number')
    expect(screen.queryByRole('option', { name: '증상 문의' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('진료과')).not.toBeInTheDocument()
  })

  it('입력한 추가 칸을 detail 로 전송한다 (빈 칸은 빼고)', async () => {
    mockConfig(HOSPITAL)
    render(<ContactForm section={section} tenantSlug="clinic" />)
    await screen.findByLabelText('진료과')

    fireEvent.change(screen.getByLabelText(/문의 유형/), { target: { value: 'SYMPTOM' } })
    fireEvent.change(screen.getByLabelText('진료과'), { target: { value: 'DENTAL' } })
    fireEvent.click(screen.getByRole('checkbox', { name: '통증' }))
    fireEvent.click(screen.getByRole('checkbox', { name: '발열' }))
    fillBase()
    submit()

    await waitFor(() => expect(api.post).toHaveBeenCalled())
    const [url, body] = api.post.mock.calls[0]
    expect(url).toBe('/inquiries')
    expect(body).toMatchObject({
      inquiry_type: 'SYMPTOM',
      detail: { department: 'DENTAL', symptoms: ['PAIN', 'FEVER'] },
    })
    expect(toast.success).toHaveBeenCalled()
  })

  it('체크아웃이 체크인보다 빠르면 에러를 보여 주고 전송하지 않는다', async () => {
    mockConfig(PENSION)
    render(<ContactForm section={section} tenantSlug="pension" />)
    await screen.findByLabelText('체크인')

    fireEvent.change(screen.getByLabelText('체크인'), { target: { value: '2026-11-05' } })
    fireEvent.change(screen.getByLabelText('체크아웃'), { target: { value: '2026-11-03' } })
    fillBase()
    submit()

    expect(await screen.findByText('체크아웃은 체크인 다음 날 이후여야 합니다.')).toBeInTheDocument()
    expect(api.post).not.toHaveBeenCalled()
  })

  it('인원이 범위를 벗어나면 에러를 보여 준다', async () => {
    mockConfig(PENSION)
    render(<ContactForm section={section} tenantSlug="pension" />)
    await screen.findByLabelText('성인')

    fireEvent.change(screen.getByLabelText('성인'), { target: { value: '50' } })
    fillBase()
    submit()

    expect(await screen.findByText(/1~30 사이 숫자로/)).toBeInTheDocument()
    expect(api.post).not.toHaveBeenCalled()
  })

  it('칸 목록을 못 받으면 일반 문의 폼으로 접수한다', async () => {
    api.get.mockRejectedValue(new Error('network'))
    render(<ContactForm section={section} tenantSlug="clinic" />)

    fillBase()
    submit()

    await waitFor(() => expect(api.post).toHaveBeenCalled())
    expect(api.post.mock.calls[0][1]).toMatchObject({ inquiry_type: 'GENERAL', detail: {} })
    expect(screen.queryByLabelText('진료과')).not.toBeInTheDocument()
  })

  it('접수 실패 시 에러 토스트', async () => {
    mockConfig(HOSPITAL)
    api.post.mockRejectedValue(new Error('500'))
    render(<ContactForm section={section} tenantSlug="clinic" />)
    await screen.findByLabelText('진료과')

    fillBase()
    submit()

    await waitFor(() => expect(toast.error).toHaveBeenCalled())
  })
})

describe('inquiryFields 유틸', () => {
  it('toDetailPayload: 빈 값 제거 · 숫자 변환', () => {
    expect(
      toDetailPayload(PENSION.fields, { check_in: '2026-11-01', check_out: '', adults: '2' }),
    ).toEqual({ check_in: '2026-11-01', adults: 2 })
    expect(toDetailPayload(HOSPITAL.fields, { symptoms: [] })).toEqual({})
    expect(toDetailPayload(HOSPITAL.fields, undefined)).toEqual({})
  })

  it('buildDetailSchema: 다중 선택 개수 제한', () => {
    const schema = buildDetailSchema(HOSPITAL.fields)
    const tooMany = Array.from({ length: 11 }, () => 'PAIN')
    expect(schema.safeParse({ symptoms: tooMany }).success).toBe(false)
    expect(schema.safeParse({ symptoms: ['PAIN'] }).success).toBe(true)
  })
})
