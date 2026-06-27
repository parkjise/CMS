import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  applyTextAction,
  applyThemeAction,
  revertTheme,
} from '@/lib/aiActions'
import type { AiAction } from '@/lib/aiChatStream'

afterEach(() => {
  document.body.innerHTML = ''
  document.documentElement.removeAttribute('style')
})

describe('applyTextAction', () => {
  it('대상 요소를 갱신하고 updateField를 호출한다', () => {
    document.body.innerHTML =
      '<h1 data-section-id="sec-1" data-field="main_title">기존 제목</h1>'
    const updateField = vi.fn()
    const action: AiAction = {
      action: 'update_text',
      section_id: 'sec-1',
      field: 'main_title',
      new_value: '새 제목',
    }

    const applied = applyTextAction(action, updateField)

    expect(applied).toBe(true)
    expect(updateField).toHaveBeenCalledWith(
      'sec-1',
      'main_title',
      '새 제목',
      '기존 제목',
    )
    const el = document.querySelector('[data-section-id="sec-1"]')
    expect((el as HTMLElement).innerText).toBe('새 제목')
  })

  it('필수 필드가 없으면 적용하지 않는다', () => {
    const updateField = vi.fn()
    expect(
      applyTextAction({ action: 'update_text' } as AiAction, updateField),
    ).toBe(false)
    expect(updateField).not.toHaveBeenCalled()
  })

  it('update_text가 아니면 적용하지 않는다', () => {
    const updateField = vi.fn()
    expect(
      applyTextAction({ action: 'explain' } as AiAction, updateField),
    ).toBe(false)
  })
})

describe('applyThemeAction / revertTheme', () => {
  it('CSS 변수를 덮어쓰고 이전 값을 반환하며, 원복할 수 있다', () => {
    const root = document.documentElement
    root.style.setProperty('--color-primary', '#000000')

    const action: AiAction = {
      action: 'update_theme',
      css_overrides: { '--color-primary': '#1a73e8' },
    }
    const previous = applyThemeAction(action)

    expect(root.style.getPropertyValue('--color-primary')).toBe('#1a73e8')
    expect(previous['--color-primary']).toBe('#000000')

    revertTheme(previous)
    expect(root.style.getPropertyValue('--color-primary')).toBe('#000000')
  })

  it('이전 값이 없던 변수는 원복 시 제거된다', () => {
    const root = document.documentElement
    const action: AiAction = {
      action: 'update_theme',
      css_overrides: { '--color-accent': '#ff0000' },
    }
    const previous = applyThemeAction(action)
    expect(root.style.getPropertyValue('--color-accent')).toBe('#ff0000')

    revertTheme(previous)
    expect(root.style.getPropertyValue('--color-accent')).toBe('')
  })

  it('update_theme이 아니면 빈 맵을 반환한다', () => {
    expect(applyThemeAction({ action: 'explain' } as AiAction)).toEqual({})
  })
})
