import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { TemplateListText } from '@/templates/shared/TemplateListText'
import { TemplateImage } from '@/templates/shared/TemplateImage'
import { useEditStore } from '@/lib/editStore'
import { replaceListItem } from '@/templates/shared/listDraft'
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

/** 눌러서 고치기 시작 — 고치는 동안은 새로 그린 요소라 다시 찾는다 */
const startEdit = (name: string) => {
  fireEvent.click(screen.getByRole('textbox', { name }))
  return screen.getByRole('textbox', { name })
}

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
    const box = startEdit('2번 기능 이름')
    type(box, '새 이름')
    fireEvent.keyDown(box, { key: 'Enter' })
    const saved = pendingList()
    expect(saved[0]).toEqual(FEATURES[0])
    expect(saved[1]).toEqual({ ...FEATURES[1], name: '새 이름' })
  })

  it('Esc 는 취소 — 저장 대기에 오르지 않는다', () => {
    useEditStore.setState({ isEditMode: true })
    renderName()
    const box = startEdit('1번 기능 이름')
    type(box, '버릴 글')
    fireEvent.keyDown(box, { key: 'Escape' })
    expect(pendingList()).toBeNull()
    expect(screen.getByRole('textbox', { name: '1번 기능 이름' }).textContent).toBe('전문 상담')
  })

  it('글자 수 한도를 넘으면 잘라서 저장 · 줄바꿈은 한 칸 띄움으로', () => {
    useEditStore.setState({ isEditMode: true })
    renderName(0, 5)
    const box = startEdit('1번 기능 이름')
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
    const box = startEdit('1번 기능 이름')
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

describe('글자 목록 · 여러 줄 · 굵게 표기 칸 (T-125-E)', () => {
  const sec = (field: string, value: unknown) =>
    ({ ...section, settings: [{ field_key: field, field_value: JSON.stringify(value), value_type: 'JSON' }] }) as PublicSection
  const pendingOf = (field: string) =>
    JSON.parse(useEditStore.getState().pendingChanges[`sec-1:${field}`]?.new_value ?? 'null')

  beforeEach(() => {
    useEditStore.setState({ isEditMode: true, isPreview: false, pendingChanges: {}, isDirty: false })
  })
  afterEach(cleanup)

  it('글자만 있는 목록 — 그 항목 글자만 바꾼다', () => {
    const items = ['첫 강점', '둘째 강점', '셋째 강점']
    render(<TemplateListText section={sec('items', items)} editable field="items" index={1} label="2번 강점" />)
    const box = startEdit('2번 강점')
    type(box, '바뀐 강점')
    fireEvent.keyDown(box, { key: 'Enter' })
    expect(pendingOf('items')).toEqual(['첫 강점', '바뀐 강점', '셋째 강점'])
  })

  it('여러 줄 칸 — Enter 는 줄바꿈(저장 안 함), 바깥을 누르면 줄바꿈을 살려 저장 대기', () => {
    const rows = [{ title: '영역', description: '한 줄' }]
    render(
      <TemplateListText section={sec('rows', rows)} editable field="rows" index={0} itemKey="description" multiline label="1번 영역 설명" />,
    )
    const box = startEdit('1번 영역 설명')
    type(box, '첫 줄\n둘째 줄\n\n\n\n넷째 줄')
    fireEvent.keyDown(box, { key: 'Enter' })
    expect(pendingOf('rows')).toBeNull()
    fireEvent.blur(box)
    expect(pendingOf('rows')[0].description).toBe('첫 줄\n둘째 줄\n\n넷째 줄')
  })

  it('굵게 표기 칸 — 평소엔 굵게, 고칠 때는 표기 그대로', () => {
    const values = ['**정직**한 진료']
    const { container } = render(
      <TemplateListText section={sec('values', values)} editable field="values" index={0} label="1번 가치" boldMarks />,
    )
    expect(container.querySelector('strong')).toHaveTextContent('정직')
    const box = startEdit('1번 가치')
    expect(box.textContent).toBe('**정직**한 진료')
    expect(container.querySelector('strong')).toBeNull()
  })

  it('같은 카드의 제목을 고치고 사진을 바꿔도 둘 다 남는다', () => {
    const cards = [{ image_url: 'https://example.com/c1.jpg', title: '카드', eyebrow: 'CARD' }]
    const s = sec('cards', cards)
    render(
      <>
        <TemplateListText section={s} editable field="cards" index={0} itemKey="title" label="1번 카드 제목" />
        <TemplateImage section={s} editable item={{ field: 'cards', index: 0 }} sizes="10px" alt="카드 사진" />
      </>,
    )
    const box = startEdit('1번 카드 제목')
    type(box, '새 카드 제목')
    fireEvent.blur(box)
    // 사진 교체 경로와 같은 함수
    act(() => replaceListItem(s, 'cards', 0, 'image_url', 'https://example.com/new.jpg'))
    expect(pendingOf('cards')[0]).toEqual({ image_url: 'https://example.com/new.jpg', title: '새 카드 제목', eyebrow: 'CARD' })
    expect(screen.getByAltText('카드 사진')).toHaveAttribute('src', 'https://example.com/new.jpg')
  })

  it('글자 목록 칸에 객체 키로, 객체 목록 칸에 키 없이 바꾸려 하면 아무것도 하지 않는다', () => {
    replaceListItem(sec('items', ['a']), 'items', 0, 'title', 'x')
    replaceListItem(sec('rows', [{ title: 'a' }]), 'rows', 0, undefined, 'x')
    expect(useEditStore.getState().pendingChanges).toEqual({})
  })

  // T-125-I — 연혁처럼 목록 안의 목록
  describe('겹 목록', () => {
    const years = [
      {
        year: 2024,
        months: [
          { month: 3, events: [{ text: '첫 사건', highlight: true }, { text: '둘째 사건' }] },
          { month: 7, events: [{ text: '다른 달 사건' }] },
        ],
      },
    ]
    const renderEvent = () =>
      render(
        <TemplateListText
          section={sec('years', years)}
          editable
          field="years"
          index={0}
          itemKey={['months', 0, 'events', 1, 'text']}
          label="연혁"
        />,
      )

    it('그 위치 글자만 바꾸고 나머지 값은 그대로 둔다', () => {
      useEditStore.setState({ isEditMode: true })
      renderEvent()
      const box = startEdit('연혁')
      expect(box).toHaveTextContent('둘째 사건')
      type(box, '고친 사건')
      fireEvent.keyDown(box, { key: 'Enter' })
      expect(pendingOf('years')).toEqual([
        {
          year: 2024,
          months: [
            { month: 3, events: [{ text: '첫 사건', highlight: true }, { text: '고친 사건' }] },
            { month: 7, events: [{ text: '다른 달 사건' }] },
          ],
        },
      ])
    })

    it('같은 목록의 다른 위치를 연달아 고쳐도 덮어쓰지 않는다', () => {
      const s = sec('years', years)
      replaceListItem(s, 'years', 0, ['months', 0, 'events', 0, 'text'], '가')
      replaceListItem(s, 'years', 0, ['months', 1, 'events', 0, 'text'], '나')
      const months = pendingOf('years')[0].months
      expect(months[0].events[0].text).toBe('가')
      expect(months[1].events[0].text).toBe('나')
    })

    it('방문자 화면에 data-field 경로를 단다', () => {
      renderEvent()
      expect(screen.getByText('둘째 사건')).toHaveAttribute('data-field', 'years.0.months.0.events.1.text')
    })

    it('없는 위치 · 글자가 아닌 값은 바꾸지 않는다', () => {
      const s = sec('years', years)
      replaceListItem(s, 'years', 0, ['months', 9, 'events', 0, 'text'], 'x')
      replaceListItem(s, 'years', 0, ['months', 0, 'events', 9, 'text'], 'x')
      replaceListItem(s, 'years', 0, ['months', 0], 'x')
      expect(useEditStore.getState().pendingChanges).toEqual({})
    })
  })

  // T-125-I — **굵게** 표기 · 링크 안 글자는 목록이 아니어도 같은 방식으로
  describe('목록이 아닌 글자 칸', () => {
    const caption = {
      ...section,
      settings: [{ field_key: 'caption', field_value: '**굵은** 설명', value_type: 'STRING' }],
    } as PublicSection
    const renderCaption = () =>
      render(<TemplateListText section={caption} editable field="caption" multiline boldMarks label="사진 설명" />)
    const pendingCaption = () => useEditStore.getState().pendingChanges['sec-1:caption']?.new_value

    it('방문자 화면은 굵게, 고칠 때는 표기 그대로', () => {
      renderCaption()
      expect(screen.getByText('굵은').tagName).toBe('STRONG')
      cleanup()
      useEditStore.setState({ isEditMode: true })
      renderCaption()
      expect(startEdit('사진 설명')).toHaveTextContent('**굵은** 설명')
    })

    it('고치면 글자 그대로 저장 대기, 그대로면 올리지 않는다', () => {
      useEditStore.setState({ isEditMode: true })
      renderCaption()
      let box = startEdit('사진 설명')
      type(box, '**굵은** 설명')
      fireEvent.blur(box)
      expect(pendingCaption()).toBeUndefined()
      box = startEdit('사진 설명')
      type(box, '**새** 설명')
      fireEvent.blur(box)
      expect(pendingCaption()).toBe('**새** 설명')
    })
  })
})
