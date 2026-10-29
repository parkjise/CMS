import { describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithQuery } from './renderWithQuery'
import { MobileSettingsForm } from '@/components/content/forms/MobileSettingsForm'
import type { Section } from '@/hooks/useSections'

// 섹션 편집 → 모바일 설정 탭 (T-037-D)

const section = (type: string, settings: Record<string, string> = {}): Section =>
  ({
    id: 'sec-1',
    tenant_id: 't-1',
    section_type: type,
    label: '섹션',
    display_order: 0,
    is_active: true,
    page_key: 'home',
    settings: Object.entries(settings).map(([field_key, field_value]) => ({
      field_key,
      field_value,
      value_type: 'STRING',
      is_sample: false,
    })),
  }) as unknown as Section

describe('MobileSettingsForm', () => {
  it('휴대폰에서 숨기기를 켜고 저장하면 mobile_hidden=true 를 보낸다', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderWithQuery(<MobileSettingsForm section={section('INTRO')} isSaving={false} onSubmit={onSubmit} />)
    const toggle = screen.getByRole('checkbox', { name: /휴대폰에서 숨기기/ })
    expect(toggle).not.toBeChecked()
    await user.click(toggle)
    await user.click(screen.getByRole('button', { name: /저장/ }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    expect(onSubmit.mock.calls[0][0]).toEqual([
      { field_key: 'mobile_hidden', field_value: 'true', value_type: 'STRING' },
    ])
  })

  it('저장된 값을 보여 주고, 배경이 없는 섹션에는 휴대폰용 이미지 칸이 없다', () => {
    renderWithQuery(
      <MobileSettingsForm section={section('INTRO', { mobile_hidden: 'true' })} isSaving={false} onSubmit={vi.fn()} />,
    )
    expect(screen.getByRole('checkbox', { name: /휴대폰에서 숨기기/ })).toBeChecked()
    expect(screen.queryByText('휴대폰용 배경 이미지')).not.toBeInTheDocument()
  })

  it('메인 배너 · 배경 사진 섹션에는 휴대폰용 이미지 칸이 있고 함께 저장한다', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderWithQuery(
      <MobileSettingsForm
        section={section('HERO_BANNER', { mobile_image_url: '/m.webp' })}
        isSaving={false}
        onSubmit={onSubmit}
      />,
    )
    expect(screen.getByText('휴대폰용 배경 이미지')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /저장/ }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    expect(onSubmit.mock.calls[0][0]).toContainEqual({
      field_key: 'mobile_image_url',
      field_value: '/m.webp',
      value_type: 'URL',
    })
    // 코드형 배경 블록(bg_image_url 이 있는 섹션)도 지원
    renderWithQuery(
      <MobileSettingsForm section={section('CONTENT_BLOCK', { bg_image_url: '/bg.jpg' })} isSaving={false} onSubmit={vi.fn()} />,
    )
    expect(screen.getAllByText('휴대폰용 배경 이미지')).toHaveLength(2)
  })
})
