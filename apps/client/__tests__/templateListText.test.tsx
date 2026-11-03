import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { TemplateListText } from '@/templates/shared/TemplateListText'
import { TemplateImage } from '@/templates/shared/TemplateImage'
import { useEditStore } from '@/lib/editStore'
import type { PublicSection } from '@/lib/publicSite.types'

// 목록 칸 안 글자 인라인 편집 · 저장 전 값 표시 규칙 (T-125-C)

const FEATURES = [
  { name: '전문 상담', name_en: 'Consulting', icon_url: 'https://example.com/i1.png', link_url: '/a' },
  { name: '맞춤 관리', name_en: 'Care', icon_url: 'https://example.com/i2.png' },
]

const FEATURES_JSON = JSON.stringify(FEATURES)

const section = {
  id: 'sec-1',
  section_type: 'INTRO',
  label: '소개',
  display_order: 0,
  is_active: true,
  settings: [{ field_key: 'features', field_value: FEATURES_JSON, value_type: 'JSON' }],
} as PublicSection

const pendingList = () =>
  JSON.parse(useEditStore.getState().pendingChanges['sec-1:features']?.new_value ?? 'null')

const renderName = (index = 0, maxLength?: number) =>
  render(
    <a href="/next">
      <TemplateListText
        section={section}
        editable
        field="features"
        index={index}
        itemKey="name"
        maxLength={maxLength}
        label={`${index + 1}번 기능 이름`}
      />
    </a>,
  )

const type = (el: HTMLElement, text: string) => {
  el.innerText = text
  fireEvent.input(el)
}

describe('TemplateListText', () => {
  beforeEach(() => {
    useEditStore.setState({ isEditMode: false, isPreview: false, pendingChanges: {}, isDirty: false })
  })
  afterEach(cleanup)

  it('방문자 화면 — 글자만, 편집 표시 없음 · 빈 값은 그리지 않는다', () => {
    renderName()
    expect(screen.getByText('전문 상담')).not.toHaveAttribute('data-editable')
    cleanup()
    const empty = { ...section, settings: [{ field_key: 'features', field_value: '[{"name":""}]', value_type: 'JSON' }] }
    const { container } = render(
      <TemplateListText section={empty as PublicSection} editable field="features" index={0} itemKey="name" />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('편집 모드 — 고치고 Enter 면 그 항목 글자만 바뀐 목록이 저장 대기에', () => {
    useEditStore.setState({ isEditMode: true })
    renderName(1)
    const box = screen.getByRole('textbox', { name: '2번 기능 이름' })
    fireEvent.click(box)
    type(box, '새 이름')
    fireEvent.keyDown(box, { key: 'Enter' })
    const saved = pendingList()
    expect(saved[0]).toEqual(FEATURES[0])
    expect(saved[1]).toEqual({ ...FEATURES[1], name: '새 이름' })
  })

  it('Esc 는 취소 — 저장 대기에 오르지 않는다', () => {
    useEditStore.setState({ isEditMode: true })
    renderName()
    const box = screen.getByRole('textbox', { name: '1번 기능 이름' })
    fireEvent.click(box)
    type(box, '버릴 글')
    fireEvent.keyDown(box, { key: 'Escape' })
    expect(pendingList()).toBeNull()
    expect(box.innerText).toBe('전문 상담')
  })

  it('글자 수 한도를 넘으면 잘라서 저장 · 줄바꿈은 한 칸 띄움으로', () => {
    useEditStore.setState({ isEditMode: true })
    renderName(0, 5)
    const box = screen.getByRole('textbox', { name: '1번 기능 이름' })
    fireEvent.click(box)
    type(box, '가나\n다라마바사')
    fireEvent.blur(box)
    expect(pendingList()[0].name).toBe('가나 다라')
  })

  it('편집 모드에서 글자를 눌러도 링크로 이동하지 않는다', () => {
    useEditStore.setState({ isEditMode: true })
    renderName()
    const box = screen.getByRole('textbox', { name: '1번 기능 이름' })
    const event = new MouseEvent('click', { bubbles: true, cancelable: true })
    box.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
  })

  it('같은 목록에서 이름을 고친 뒤 아이콘을 바꿔도 이름이 남는다', () => {
    useEditStore.setState({ isEditMode: true })
    renderName()
    const box = screen.getByRole('textbox', { name: '1번 기능 이름' })
    fireEvent.click(box)
    type(box, '고친 이름')
    fireEvent.blur(box)
    // 아이콘 교체와 같은 경로 (replaceListItem)
    const draft = pendingList()
    draft[0].icon_url = 'https://example.com/new-icon.png'
    useEditStore.getState().updateField('sec-1', 'features', JSON.stringify(draft), FEATURES_JSON)
    expect(pendingList()[0]).toEqual({ ...FEATURES[0], name: '고친 이름', icon_url: 'https://example.com/new-icon.png' })
  })
})

describe('저장 전 값은 편집 모드에서만 (hydration 일치)', () => {
  afterEach(cleanup)

  it('초안이 남아 있어도 편집 모드가 아니면 저장된 사진 · 글자를 그린다', () => {
    const draft = [{ ...FEATURES[0], name: '초안 이름', icon_url: 'https://example.com/draft.png' }, FEATURES[1]]
    useEditStore.setState({
      isEditMode: false,
      isPreview: false,
      pendingChanges: {
        'sec-1:features': {
          section_id: 'sec-1',
          field: 'features',
          original_value: FEATURES_JSON,
          new_value: JSON.stringify(draft),
          changed_at: new Date().toISOString(),
        },
      },
    })
    const { rerender } = render(
      <>
        <TemplateListText section={section} editable field="features" index={0} itemKey="name" />
        <TemplateImage section={section} editable item={{ field: 'features', index: 0, key: 'icon_url' }} sizes="10px" alt="아이콘" />
      </>,
    )
    expect(screen.getByText('전문 상담')).toBeInTheDocument()
    expect(screen.getByAltText('아이콘')).toHaveAttribute('src', 'https://example.com/i1.png')

    useEditStore.setState({ isEditMode: true })
    rerender(
      <>
        <TemplateListText section={section} editable field="features" index={0} itemKey="name" />
        <TemplateImage section={section} editable item={{ field: 'features', index: 0, key: 'icon_url' }} sizes="10px" alt="아이콘" />
      </>,
    )
    expect(screen.getByText('초안 이름')).toBeInTheDocument()
    expect(screen.getByAltText('아이콘')).toHaveAttribute('src', 'https://example.com/draft.png')
  })
})
