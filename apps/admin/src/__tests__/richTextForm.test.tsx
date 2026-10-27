import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HeroBannerForm } from '@/components/content/forms/HeroBannerForm'
import {
  getSetting,
  preserveRichText,
  richToPlainText,
  strSetting,
} from '@/components/content/forms/utils'
import type { Section, SectionSetting } from '@/hooks/useSections'

// 관리자 폼과 서식 글 (T-065-A) — 폼은 글자만, 고치지 않으면 서식 유지

const richTitle: SectionSetting = {
  id: 'st-1',
  field_key: 'main_title',
  field_value: '<b>환영</b> &amp; 안녕<br>둘째 줄',
  value_type: 'RICH_TEXT',
} as SectionSetting

const section: Section = {
  id: 's-1',
  tenant_id: 't-1',
  section_type: 'HERO_BANNER',
  label: '메인 배너',
  display_order: 0,
  is_active: true,
  settings: [richTitle],
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

describe('서식 글 도우미', () => {
  it('richToPlainText — 태그를 빼고 엔티티 · 줄바꿈 복원', () => {
    expect(richToPlainText('<b>환영</b> &amp; 안녕<br>둘째 줄')).toBe('환영 & 안녕\n둘째 줄')
  })

  it('getSetting 은 서식 글을 글자로 돌려준다', () => {
    expect(getSetting([richTitle], 'main_title')).toBe('환영 & 안녕\n둘째 줄')
  })

  it('고치지 않은 서식 글은 원래 HTML · RICH_TEXT 로 보낸다', () => {
    const [u] = preserveRichText([richTitle], [strSetting('main_title', '환영 & 안녕\n둘째 줄')])
    expect(u).toEqual({
      field_key: 'main_title',
      field_value: '<b>환영</b> &amp; 안녕<br>둘째 줄',
      value_type: 'RICH_TEXT',
    })
  })

  it('글자를 고치면 일반 글자로 보낸다 (서식은 지워짐)', () => {
    const [u] = preserveRichText([richTitle], [strSetting('main_title', '새 제목')])
    expect(u).toEqual({ field_key: 'main_title', field_value: '새 제목', value_type: 'STRING' })
  })

  it('일반 글자 칸은 그대로', () => {
    const plain = { ...richTitle, value_type: 'STRING', field_value: '<b>x</b>' } as SectionSetting
    const [u] = preserveRichText([plain], [strSetting('main_title', 'x')])
    expect(u.value_type).toBe('STRING')
    expect(u.field_value).toBe('x')
  })
})

describe('HeroBannerForm — 서식 글', () => {
  it('서식 글 칸에는 안내가 보이고 입력칸에는 글자만', () => {
    render(<HeroBannerForm section={section} isSaving={false} onSubmit={vi.fn()} />)
    expect(screen.getByRole('note').textContent).toContain('서식이 지워집니다')
    const input = screen.getByPlaceholderText(/강남 통증의학과/) as HTMLInputElement
    expect(input.value).not.toContain('<b>')
  })

  it('서식 없는 섹션에는 안내가 없다', () => {
    render(
      <HeroBannerForm section={{ ...section, settings: [] }} isSaving={false} onSubmit={vi.fn()} />
    )
    expect(screen.queryByRole('note')).toBeNull()
  })

  it('저장 시 폼은 글자를 보내고, 페이지가 preserveRichText 로 서식을 지킨다', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    const multiLine = { ...richTitle, field_value: '<b>환영</b> 인사' } as SectionSetting
    render(
      <HeroBannerForm section={{ ...section, settings: [multiLine] }} isSaving={false} onSubmit={onSubmit} />
    )
    await user.click(screen.getByRole('button', { name: '변경사항 저장' }))
    const sent = preserveRichText([multiLine], onSubmit.mock.calls[0][0])
    expect(sent.find((s) => s.field_key === 'main_title')).toMatchObject({
      field_value: '<b>환영</b> 인사',
      value_type: 'RICH_TEXT',
    })
  })
})
