import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EditToolbar } from '@/components/edit/EditToolbar'
import { EditableButton } from '@/components/edit/EditableButton'
import { EditableText } from '@/components/edit/EditableText'
import { EditableGallery } from '@/components/edit/EditableGallery'
import { useEditStore } from '@/lib/editStore'
import { useClientAuthStore } from '@/lib/authStore'

// 편집 모드 미리보기 · 버튼 편집 팝업 (기획서 12.2 · 12.4, T-065-B)

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const change = (field: string, value: string, format?: 'rich') => ({
  section_id: 'sec-1',
  field,
  original_value: '',
  new_value: value,
  changed_at: new Date().toISOString(),
  ...(format ? { format } : {}),
})

const enterEditMode = () => {
  useClientAuthStore.setState({ isLoggedIn: true })
  useEditStore.setState({ isEditMode: true, isPreview: false })
}

const pending = (field: string) => useEditStore.getState().pendingChanges[`sec-1:${field}`]

beforeEach(() => {
  useEditStore.setState({
    isEditMode: false,
    isPreview: false,
    pendingChanges: {},
    isDirty: false,
    isAiPanelOpen: false,
  })
  useClientAuthStore.setState({ user: null, isLoggedIn: false })
  document.body.classList.remove('edit-mode')
})
afterEach(cleanup)

describe('editStore 미리보기', () => {
  it('편집 모드에서만 켜지고, 편집을 끝내면 함께 꺼진다', () => {
    useEditStore.getState().setPreview(true)
    expect(useEditStore.getState().isPreview).toBe(false)
    enterEditMode()
    useEditStore.getState().setPreview(true)
    expect(useEditStore.getState().isPreview).toBe(true)
    useEditStore.getState().exitEditMode()
    expect(useEditStore.getState().isPreview).toBe(false)
  })

  it('미리보기를 켜면 AI 패널을 닫는다', () => {
    enterEditMode()
    useEditStore.setState({ isAiPanelOpen: true })
    useEditStore.getState().setPreview(true)
    expect(useEditStore.getState().isAiPanelOpen).toBe(false)
  })
})

describe('EditToolbar 미리보기', () => {
  it('[미리보기] → 편집 표시가 꺼지고 끝내기 버튼만, 끝내면 편집 툴바로', async () => {
    const user = userEvent.setup()
    enterEditMode()
    useEditStore.setState({ pendingChanges: { 'sec-1:main_title': change('main_title', '새') } })
    render(<EditToolbar />)
    expect(document.body.classList.contains('edit-mode')).toBe(true)

    await user.click(screen.getByRole('button', { name: '미리보기' }))
    expect(screen.getByRole('toolbar', { name: '미리보기 툴바' }).textContent).toContain(
      '저장 전 변경 1개 포함',
    )
    expect(screen.queryByRole('button', { name: /^저장/ })).toBeNull()
    expect(document.body.classList.contains('edit-mode')).toBe(false)

    await user.click(screen.getByRole('button', { name: '미리보기 끝내기' }))
    expect(screen.getByRole('toolbar', { name: '편집 모드 툴바' })).toBeTruthy()
    expect(document.body.classList.contains('edit-mode')).toBe(true)
    // 고친 내용은 그대로
    expect(pending('main_title')?.new_value).toBe('새')
  })

  it('Esc 로 미리보기를 끝낸다', () => {
    enterEditMode()
    useEditStore.setState({ isPreview: true })
    render(<EditToolbar />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(useEditStore.getState().isPreview).toBe(false)
  })
})

describe('EditableText — 저장 전 값 표시 · 미리보기', () => {
  const renderTitle = () =>
    render(
      <EditableText sectionId="sec-1" field="main_title" initialValue="원래 제목" as="h1" formatting />,
    )

  it('편집 모드에서는 저장 전 고친 값(서식 포함)을 보여 준다', () => {
    enterEditMode()
    useEditStore.setState({
      pendingChanges: { 'sec-1:main_title': change('main_title', '<b>고친</b> 제목', 'rich') },
    })
    const { container } = renderTitle()
    expect(container.querySelector('h1 b')?.textContent).toBe('고친')
  })

  it('미리보기에서는 고친 값을 보여 주되 눌러도 편집되지 않는다', () => {
    enterEditMode()
    useEditStore.setState({
      isPreview: true,
      pendingChanges: { 'sec-1:main_title': change('main_title', '고친 제목') },
    })
    renderTitle()
    const el = screen.getByText('고친 제목')
    fireEvent.click(el)
    expect(el.getAttribute('contenteditable')).toBeFalsy()
    expect(screen.queryByRole('toolbar', { name: '글자 서식' })).toBeNull()
  })

  it('편집 모드가 아니면 서버 값 그대로 (남은 초안은 보이지 않음)', () => {
    useEditStore.setState({
      pendingChanges: { 'sec-1:main_title': change('main_title', '초안') },
    })
    renderTitle()
    expect(screen.getByText('원래 제목')).toBeTruthy()
  })
})

describe('EditableGallery 미리보기', () => {
  it('고친 사진 목록을 편집 버튼 없이 보여 준다', () => {
    enterEditMode()
    useEditStore.setState({
      isPreview: true,
      pendingChanges: {
        'sec-1:gallery_items': change(
          'gallery_items',
          JSON.stringify([{ image_url: 'https://example.com/a.webp', caption: '새 사진' }]),
        ),
      },
    })
    render(
      <EditableGallery sectionId="sec-1" initialItems={[]}>
        <p>서버 렌더링</p>
      </EditableGallery>,
    )
    expect(screen.getByText('새 사진')).toBeTruthy()
    expect(screen.queryByRole('button', { name: '사진 삭제' })).toBeNull()
    expect(screen.queryByText('서버 렌더링')).toBeNull()
  })
})

describe('EditableButton', () => {
  const renderButton = () =>
    render(
      <EditableButton
        sectionId="sec-1"
        textField="cta_text"
        urlField="cta_url"
        initialText="문의하기"
        initialUrl="/contact"
        maxLength={20}
      />,
    )

  it('방문자 화면 — 일반 링크', () => {
    renderButton()
    const link = screen.getByRole('link', { name: '문의하기' })
    expect(link.getAttribute('href')).toBe('/contact')
    expect(link.getAttribute('aria-haspopup')).toBeNull()
  })

  it('편집 모드 — 누르면 팝업, 문구 · 링크를 고쳐 적용하면 저장 대기', async () => {
    const user = userEvent.setup()
    enterEditMode()
    renderButton()
    await user.click(screen.getByRole('link', { name: '문의하기' }))
    const dialog = screen.getByRole('dialog', { name: '버튼 편집' })
    expect(dialog).toBeTruthy()

    const text = screen.getByLabelText(/버튼 문구/)
    await user.clear(text)
    await user.type(text, '상담 예약')
    const url = screen.getByLabelText('링크 주소')
    await user.clear(url)
    await user.type(url, 'tel:02-123-4567')
    await user.click(screen.getByRole('button', { name: '적용' }))

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(pending('cta_text')?.new_value).toBe('상담 예약')
    expect(pending('cta_url')?.new_value).toBe('tel:02-123-4567')
    // 저장 전 값으로 다시 그린다
    expect(screen.getByRole('link', { name: '상담 예약' }).getAttribute('href')).toBe(
      'tel:02-123-4567',
    )
  })

  it('바꾸지 않은 칸은 저장 대기에 넣지 않는다', async () => {
    const user = userEvent.setup()
    enterEditMode()
    renderButton()
    await user.click(screen.getByRole('link', { name: '문의하기' }))
    const url = screen.getByLabelText('링크 주소')
    await user.clear(url)
    await user.type(url, 'https://booking.example.com')
    await user.click(screen.getByRole('button', { name: '적용' }))
    expect(pending('cta_text')).toBeUndefined()
    expect(pending('cta_url')?.new_value).toBe('https://booking.example.com')
  })

  it.each(['javascript:alert(1)', 'example.com', '//evil.example', 'https://a.com/<x>', ''])(
    '위험하거나 잘못된 링크는 거절: %s',
    async (bad) => {
      const user = userEvent.setup()
      enterEditMode()
      renderButton()
      await user.click(screen.getByRole('link', { name: '문의하기' }))
      const url = screen.getByLabelText('링크 주소')
      await user.clear(url)
      if (bad) await user.type(url, bad)
      await user.click(screen.getByRole('button', { name: '적용' }))
      expect(screen.getByRole('alert').textContent).toContain('링크 주소')
      expect(pending('cta_url')).toBeUndefined()
    },
  )

  it('문구가 비었거나 너무 길면 거절', async () => {
    const user = userEvent.setup()
    enterEditMode()
    renderButton()
    await user.click(screen.getByRole('link', { name: '문의하기' }))
    const text = screen.getByLabelText(/버튼 문구/)
    await user.clear(text)
    await user.click(screen.getByRole('button', { name: '적용' }))
    expect(screen.getByRole('alert').textContent).toContain('문구를 입력')
    await user.type(text, '가'.repeat(21))
    await user.click(screen.getByRole('button', { name: '적용' }))
    expect(screen.getByRole('alert').textContent).toContain('20자 이하')
    expect(pending('cta_text')).toBeUndefined()
  })

  it('취소 · 팝업 밖 클릭은 저장하지 않는다', async () => {
    const user = userEvent.setup()
    enterEditMode()
    renderButton()
    await user.click(screen.getByRole('link', { name: '문의하기' }))
    await user.type(screen.getByLabelText(/버튼 문구/), '!')
    await user.click(screen.getByRole('button', { name: '취소' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    await user.click(screen.getByRole('link', { name: '문의하기' }))
    fireEvent.mouseDown(document.body)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(pending('cta_text')).toBeUndefined()
  })

  it('미리보기에서는 일반 링크처럼 보이고 팝업이 열리지 않는다', () => {
    enterEditMode()
    useEditStore.setState({ isPreview: true })
    renderButton()
    expect(screen.getByRole('link', { name: '문의하기' }).getAttribute('aria-haspopup')).toBeNull()
  })
})

describe('EditableButton — 버튼 스타일 · 새 창 열기 (T-088-A)', () => {
  const variants = { filled: 'is-filled', outline: 'is-outline' }
  const renderStyled = (initialStyle: 'filled' | 'outline' = 'filled', initialNewTab = false) =>
    render(
      <EditableButton
        sectionId="sec-1"
        textField="cta_text"
        urlField="cta_url"
        styleField="cta_style"
        newTabField="cta_new_tab"
        initialText="문의하기"
        initialUrl="/contact"
        initialStyle={initialStyle}
        initialNewTab={initialNewTab}
        className="base"
        variantClassName={variants}
      />,
    )

  it('방문자 화면 — 스타일 클래스, 새 창이면 target=_blank + noopener', () => {
    renderStyled('outline', true)
    const link = screen.getByRole('link', { name: '문의하기' })
    expect(link.className).toContain('base')
    expect(link.className).toContain('is-outline')
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toContain('noopener')
  })

  it('같은 창이 기본 — target 없음', () => {
    renderStyled()
    const link = screen.getByRole('link', { name: '문의하기' })
    expect(link.className).toContain('is-filled')
    expect(link.getAttribute('target')).toBeNull()
  })

  it('편집 모드 팝업에서 스타일 · 새 창을 바꾸면 저장 대기, 바로 다시 그린다', async () => {
    const user = userEvent.setup()
    enterEditMode()
    renderStyled()
    await user.click(screen.getByRole('link', { name: '문의하기' }))
    await user.click(screen.getByLabelText('테두리 버튼'))
    await user.click(screen.getByLabelText('새 창으로 열기'))
    await user.click(screen.getByRole('button', { name: '적용' }))
    expect(pending('cta_style')?.new_value).toBe('outline')
    expect(pending('cta_new_tab')?.new_value).toBe('true')
    // 문구 · 주소는 안 바꿨으므로 저장 대기에 없음
    expect(pending('cta_text')).toBeUndefined()
    expect(screen.getByRole('link', { name: '문의하기' }).className).toContain('is-outline')
  })
})

