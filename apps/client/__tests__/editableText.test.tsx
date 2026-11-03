import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { EditableText } from '@/components/edit/EditableText'
import { useEditStore } from '@/lib/editStore'
import { useClientAuthStore } from '@/lib/authStore'

const SECTION_ID = 'sec-1'
const FIELD = 'main_title'
const INITIAL = '메인 타이틀'

const resetStores = () => {
  useEditStore.setState({
    isEditMode: false,
    pendingChanges: {},
    isDirty: false,
  })
  useClientAuthStore.setState({ user: null, isLoggedIn: false })
}

const enableEditMode = () => {
  useClientAuthStore.setState({ isLoggedIn: true })
  useEditStore.setState({ isEditMode: true })
}

const renderText = (overrides: Partial<{ initialValue: string; maxLength: number; multiline: boolean }> = {}) => {
  return render(
    <EditableText
      sectionId={SECTION_ID}
      field={FIELD}
      initialValue={overrides.initialValue ?? INITIAL}
      maxLength={overrides.maxLength}
      multiline={overrides.multiline}
      as="h1"
    />,
  )
}

describe('EditableText', () => {
  beforeEach(() => {
    resetStores()
  })

  afterEach(() => {
    cleanup()
  })

  it('비편집 모드에서는 contentEditable 비활성', () => {
    renderText()
    const el = screen.getByText(INITIAL)
    expect(el.getAttribute('contenteditable')).toBeFalsy()
  })

  it('편집 모드 + 클릭 시 contentEditable 활성', () => {
    enableEditMode()
    renderText()
    const el = screen.getByText(INITIAL)
    fireEvent.click(el)
    expect(el.getAttribute('contenteditable')).toBe('true')
  })

  it('편집 후 blur → pendingChanges에 새 값 저장', () => {
    enableEditMode()
    renderText()
    const el = screen.getByText(INITIAL)
    fireEvent.click(el)
    el.innerText = '새 타이틀'
    fireEvent.blur(el)

    const change =
      useEditStore.getState().pendingChanges[`${SECTION_ID}:${FIELD}`]
    expect(change).toMatchObject({
      section_id: SECTION_ID,
      field: FIELD,
      original_value: INITIAL,
      new_value: '새 타이틀',
    })
    expect(useEditStore.getState().isDirty).toBe(true)
  })

  it('값이 동일하면 pendingChanges 비어있음', () => {
    enableEditMode()
    renderText()
    const el = screen.getByText(INITIAL)
    fireEvent.click(el)
    fireEvent.blur(el)

    expect(useEditStore.getState().pendingChanges).toEqual({})
    expect(useEditStore.getState().isDirty).toBe(false)
  })

  it('maxLength 초과 입력 후 blur → truncate된 값 저장', () => {
    enableEditMode()
    renderText({ maxLength: 5 })
    const el = screen.getByText(INITIAL)
    fireEvent.click(el)
    el.innerText = '12345678'
    fireEvent.blur(el)

    const change =
      useEditStore.getState().pendingChanges[`${SECTION_ID}:${FIELD}`]
    expect(change?.new_value).toBe('12345')
  })

  it('multiline=false에서 Enter 키 → 차단 + commit', () => {
    enableEditMode()
    renderText()
    const el = screen.getByText(INITIAL)
    fireEvent.click(el)
    el.innerText = '변경값'
    fireEvent.keyDown(el, { key: 'Enter' })

    const change =
      useEditStore.getState().pendingChanges[`${SECTION_ID}:${FIELD}`]
    expect(change?.new_value).toBe('변경값')
  })

  it('Escape 키 → 원래 값 복원 + pendingChanges 비어있음', () => {
    enableEditMode()
    renderText()
    const el = screen.getByText(INITIAL)
    fireEvent.click(el)
    el.innerText = '임시 변경'
    fireEvent.keyDown(el, { key: 'Escape' })

    expect(el.innerText).toBe(INITIAL)
    expect(useEditStore.getState().pendingChanges).toEqual({})
    expect(useEditStore.getState().isDirty).toBe(false)
  })

  it('편집 모드일 때 maxLength 글자 카운터 노출', () => {
    enableEditMode()
    renderText({ maxLength: 40 })
    const el = screen.getByText(INITIAL)
    fireEvent.click(el)
    expect(screen.getByText(`${INITIAL.length} / 40`)).toBeInTheDocument()
  })

  // T-125-G — 감싸개가 inline-block 이면 제목 · 문단이 옆 글자와 한 줄로 붙어 배치가 깨진다
  it.each(['h1', 'h2', 'p', 'div'] as const)('편집 모드 %s 감싸개는 block', (tag) => {
    enableEditMode()
    render(<EditableText sectionId={SECTION_ID} field={FIELD} initialValue={INITIAL} as={tag} />)
    const wrap = screen.getByText(INITIAL).parentElement!
    expect(wrap).toHaveAttribute('data-editable-wrap')
    expect(wrap).toHaveClass('block')
    expect(wrap).not.toHaveClass('inline-block')
  })

  it('편집 모드 span 감싸개는 inline-block (글 사이 짧은 글자 유지)', () => {
    enableEditMode()
    render(<EditableText sectionId={SECTION_ID} field={FIELD} initialValue={INITIAL} as="span" />)
    const wrap = screen.getByText(INITIAL).parentElement!
    expect(wrap).toHaveClass('inline-block')
  })

  it('보기 모드에서는 감싸개 없이 태그만 그린다', () => {
    renderText()
    expect(screen.getByText(INITIAL).parentElement).not.toHaveAttribute('data-editable-wrap')
  })
})
