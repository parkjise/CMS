import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HeroBannerForm } from '@/components/content/forms/HeroBannerForm'
import type { Section } from '@/hooks/useSections'

const baseSection: Section = {
  id: 's-1',
  tenant_id: 't-1',
  section_type: 'HERO_BANNER',
  label: '메인 배너',
  display_order: 0,
  is_active: true,
  settings: [],
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

describe('HeroBannerForm', () => {
  it('정상 입력 시 onSubmit이 5개 setting과 함께 호출된다', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn().mockResolvedValue(undefined)

    render(
      <HeroBannerForm
        section={baseSection}
        isSaving={false}
        onSubmit={onSubmit}
      />
    )

    await user.type(screen.getByPlaceholderText(/강남 통증의학과/), '제목')
    await user.click(screen.getByRole('button', { name: '변경사항 저장' }))

    expect(onSubmit).toHaveBeenCalledTimes(1)
    const payload = onSubmit.mock.calls[0][0]
    expect(payload).toHaveLength(5)
    const fields = payload.map((p: { field_key: string }) => p.field_key)
    expect(fields).toContain('main_title')
    expect(fields).toContain('sub_copy')
    expect(fields).toContain('bg_image_url')
    expect(fields).toContain('cta_text')
    expect(fields).toContain('cta_url')
  })

  it('메인 타이틀 40자 초과 시 저장 버튼이 비활성화되고 안내 메시지 표시', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()

    render(
      <HeroBannerForm
        section={baseSection}
        isSaving={false}
        onSubmit={onSubmit}
      />
    )

    const titleInput = screen.getByPlaceholderText(/강남 통증의학과/)
    await user.type(titleInput, 'a'.repeat(41))

    const saveBtn = screen.getByRole('button', { name: '변경사항 저장' })
    expect(saveBtn).toBeDisabled()
    expect(screen.getByText(/글자 수 제한/)).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('isSaving=true이면 저장 중 라벨 + 비활성', () => {
    render(
      <HeroBannerForm
        section={baseSection}
        isSaving={true}
        onSubmit={vi.fn()}
      />
    )
    const btn = screen.getByRole('button', { name: '저장 중...' })
    expect(btn).toBeDisabled()
  })
})
