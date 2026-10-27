import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { EditableText } from '@/components/edit/EditableText'
import { TemplateText } from '@/templates/shared/TemplateText'
import { useEditStore } from '@/lib/editStore'
import { useClientAuthStore } from '@/lib/authStore'
import type { PublicSection } from '@/lib/publicSite.types'

// 인라인 편집 미니 툴바 — 서식 적용 · 저장 값 · 표시 (기획서 12.2, T-065-A)

const SECTION_ID = 'sec-1'
const FIELD = 'main_title'

const enableEditMode = () => {
  useClientAuthStore.setState({ isLoggedIn: true })
  useEditStore.setState({ isEditMode: true })
}

const pending = () => useEditStore.getState().pendingChanges[`${SECTION_ID}:${FIELD}`]

const selectText = (el: HTMLElement, start: number, end: number) => {
  const text = el.firstChild as Text
  const range = document.createRange()
  range.setStart(text, start)
  range.setEnd(text, end)
  const sel = window.getSelection()
  sel?.removeAllRanges()
  sel?.addRange(range)
}

const renderEditable = (props: Partial<React.ComponentProps<typeof EditableText>> = {}) =>
  render(
    <EditableText
      sectionId={SECTION_ID}
      field={FIELD}
      initialValue="환영합니다 고객님"
      maxLength={40}
      as="h1"
      formatting
      {...props}
    />,
  )

describe('미니 툴바', () => {
  beforeEach(() => {
    useEditStore.setState({ isEditMode: false, pendingChanges: {}, isDirty: false })
    useClientAuthStore.setState({ user: null, isLoggedIn: false })
  })
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('편집 중일 때만 툴바가 보인다 — 5가지 서식', () => {
    enableEditMode()
    renderEditable()
    expect(screen.queryByRole('toolbar', { name: '글자 서식' })).toBeNull()
    fireEvent.click(screen.getByText('환영합니다 고객님'))
    expect(screen.getByRole('toolbar', { name: '글자 서식' })).toBeTruthy()
    for (const name of ['굵게', '기울임', '글자 색: 주 색상', '글자 크기: 크게', '링크']) {
      expect(screen.getByRole('button', { name })).toBeTruthy()
    }
  })

  it('formatting 이 꺼진 칸은 툴바가 없다', () => {
    enableEditMode()
    renderEditable({ formatting: false })
    fireEvent.click(screen.getByText('환영합니다 고객님'))
    expect(screen.queryByRole('toolbar')).toBeNull()
  })

  it('색을 고르고 나가면 서식 글(rich)로 저장 대기', () => {
    enableEditMode()
    renderEditable()
    const el = screen.getByText('환영합니다 고객님')
    fireEvent.click(el)
    selectText(el, 0, 5)
    fireEvent.click(screen.getByRole('button', { name: '글자 색: 주 색상' }))
    fireEvent.blur(el)
    expect(pending()).toMatchObject({
      new_value: '<span class="rt-c-primary">환영합니다</span> 고객님',
      format: 'rich',
    })
  })

  it('굵게는 <b> 로 감싸고, 다시 누르면 해제', () => {
    enableEditMode()
    renderEditable()
    const el = screen.getByText('환영합니다 고객님')
    fireEvent.click(el)
    selectText(el, 0, 5)
    fireEvent.click(screen.getByRole('button', { name: '굵게' }))
    expect(el.innerHTML).toBe('<b>환영합니다</b> 고객님')
    fireEvent.click(screen.getByRole('button', { name: '굵게' }))
    expect(el.innerHTML).toBe('환영합니다 고객님')
    fireEvent.click(screen.getByRole('button', { name: '기울임' }))
    fireEvent.blur(el)
    expect(pending()).toMatchObject({ new_value: '<i>환영합니다</i> 고객님', format: 'rich' })
  })

  it('크기를 다시 보통으로 하면 서식 없는 일반 글자로 저장', () => {
    enableEditMode()
    renderEditable({ initialValue: '<span class="rt-s-lg">큰</span> 글', valueType: 'RICH_TEXT' })
    const el = document.querySelector<HTMLElement>('[data-field="main_title"]')!
    fireEvent.click(el)
    const range = document.createRange()
    range.selectNodeContents(el)
    window.getSelection()?.removeAllRanges()
    window.getSelection()?.addRange(range)
    fireEvent.click(screen.getByRole('button', { name: '글자 크기: 보통' }))
    fireEvent.blur(el)
    expect(pending()).toMatchObject({ new_value: '큰 글' })
    expect(pending()?.format).toBeUndefined()
  })

  it('서식 지우기', () => {
    enableEditMode()
    renderEditable({ initialValue: '<b>굵은</b> 글', valueType: 'RICH_TEXT' })
    const el = document.querySelector<HTMLElement>('[data-field="main_title"]')!
    fireEvent.click(el)
    const range = document.createRange()
    range.selectNodeContents(el)
    window.getSelection()?.removeAllRanges()
    window.getSelection()?.addRange(range)
    fireEvent.click(screen.getByRole('button', { name: '서식 지우기' }))
    fireEvent.blur(el)
    expect(pending()?.new_value).toBe('굵은 글')
  })

  it('위험한 링크 주소는 거절한다', () => {
    enableEditMode()
    const alert = vi.spyOn(window, 'alert').mockImplementation(() => {})
    vi.spyOn(window, 'prompt').mockReturnValue('javascript:alert(1)')
    const exec = vi.fn(() => true)
    document.execCommand = exec
    renderEditable()
    const el = screen.getByText('환영합니다 고객님')
    fireEvent.click(el)
    selectText(el, 0, 5)
    fireEvent.click(screen.getByRole('button', { name: '링크' }))
    expect(alert).toHaveBeenCalled()
    expect(exec).not.toHaveBeenCalledWith('createLink', false, expect.anything())
  })

  it('링크 주소를 묻는 동안에는 blur 로 저장하지 않고, 안전한 주소면 링크를 건다', () => {
    enableEditMode()
    const exec = vi.fn(() => true)
    document.execCommand = exec
    renderEditable()
    const el = screen.getByText('환영합니다 고객님')
    fireEvent.click(el)
    selectText(el, 0, 5)
    vi.spyOn(window, 'prompt').mockImplementation(() => {
      fireEvent.blur(el)
      return 'tel:010-1234-5678'
    })
    fireEvent.click(screen.getByRole('button', { name: '링크' }))
    expect(pending()).toBeUndefined()
    expect(el.getAttribute('contenteditable')).toBe('true')
    expect(exec).toHaveBeenCalledWith('createLink', false, 'tel:010-1234-5678')
  })

  it('글자 수 표시는 태그를 뺀 글자 수', () => {
    enableEditMode()
    renderEditable({ initialValue: '<b>가나</b>다', valueType: 'RICH_TEXT' })
    fireEvent.click(document.querySelector('[data-field="main_title"]')!)
    expect(screen.getByText('3 / 40')).toBeTruthy()
  })
})

describe('서식 글 표시', () => {
  afterEach(cleanup)

  it('방문자 화면 — 서식은 HTML 로, 스크립트는 걸러서', () => {
    useEditStore.setState({ isEditMode: false })
    const { container } = render(
      <EditableText
        sectionId={SECTION_ID}
        field={FIELD}
        initialValue={'<b>굵게</b><img src=x onerror="alert(1)"><script>x</script>'}
        valueType="RICH_TEXT"
        as="h1"
      />,
    )
    const h1 = container.querySelector('h1')!
    expect(h1.querySelector('b')?.textContent).toBe('굵게')
    expect(h1.querySelector('img, script')).toBeNull()
  })

  it('일반 글자는 꺾쇠도 글자 그대로', () => {
    useEditStore.setState({ isEditMode: false })
    const { container } = render(
      <EditableText sectionId={SECTION_ID} field={FIELD} initialValue="<b>무료</b> 상담" as="h1" />,
    )
    expect(container.querySelector('h1 b')).toBeNull()
    expect(container.querySelector('h1')?.textContent).toBe('<b>무료</b> 상담')
  })

  it('템플릿 글(TemplateText)도 서식 글을 표시한다', () => {
    const section: PublicSection = {
      id: SECTION_ID,
      section_type: 'BRAND_INTRO',
      label: '소개',
      display_order: 0,
      is_active: true,
      settings: [
        { field_key: 'title', field_value: '<i>기울임</i> 제목', value_type: 'RICH_TEXT' },
      ],
    }
    const { container } = render(
      <TemplateText section={section} editable={false} field="title" as="h2" />,
    )
    expect(container.querySelector('h2 i')?.textContent).toBe('기울임')
  })
})
