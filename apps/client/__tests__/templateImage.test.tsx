import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ImageEditButtons, TemplateImage } from '@/templates/shared/TemplateImage'
import { useEditStore } from '@/lib/editStore'
import type { PublicSection } from '@/lib/publicSite.types'

// 업로드 창 — 열리면 '올리기' 한 번에 다음 주소로 올린 것으로
let nextUploadUrl = ''
vi.mock('@/components/edit/ImageUploadModal', () => ({
  ImageUploadModal: ({
    open,
    onUploaded,
    onClose,
  }: {
    open: boolean
    onUploaded: (url: string) => void
    onClose: () => void
  }) =>
    open ? (
      <div role="dialog">
        <button
          type="button"
          onClick={() => {
            onUploaded(nextUploadUrl)
            onClose()
          }}
        >
          올리기
        </button>
      </div>
    ) : null,
}))

const SLIDES = [
  { image_url: 'https://example.com/s1.jpg', title: '첫 번째' },
  { image_url: 'https://example.com/s2.jpg', title: '두 번째', mobile_image_url: 'https://example.com/s2-m.jpg' },
]

const section: PublicSection = {
  id: 'sec-1',
  section_type: 'CONTENT_BLOCK',
  label: '소개',
  display_order: 0,
  is_active: true,
  settings: [
    { field_key: 'image_url', field_value: 'https://example.com/photo.jpg', value_type: 'url' },
    { field_key: 'slides', field_value: JSON.stringify(SLIDES), value_type: 'JSON' },
  ],
} as PublicSection

const pending = (field: string) => useEditStore.getState().pendingChanges[`sec-1:${field}`]?.new_value

const upload = (buttonName: string | RegExp, url: string) => {
  nextUploadUrl = url
  fireEvent.click(screen.getByRole('button', { name: buttonName }))
  fireEvent.click(screen.getByRole('button', { name: '올리기' }))
}

describe('TemplateImage (T-125-B)', () => {
  beforeEach(() => {
    useEditStore.setState({ isEditMode: false, isPreview: false, pendingChanges: {}, isDirty: false })
  })
  afterEach(cleanup)

  it('방문자 화면 — 사진만, 버튼 없음', () => {
    render(<TemplateImage section={section} editable field="image_url" sizes="100vw" alt="사진" />)
    expect(screen.getByAltText('사진')).toHaveAttribute('src', 'https://example.com/photo.jpg')
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('편집 모드 — 실제 섹션이면 버튼, 샘플 섹션 · 미리보기면 없음', () => {
    useEditStore.setState({ isEditMode: true })
    const { rerender } = render(<TemplateImage section={section} editable field="image_url" sizes="100vw" alt="사진" />)
    expect(screen.getByRole('button', { name: '사진 변경' })).toBeInTheDocument()

    rerender(<TemplateImage section={section} editable={false} field="image_url" sizes="100vw" alt="사진" />)
    expect(screen.queryByRole('button')).toBeNull()

    useEditStore.setState({ isPreview: true })
    rerender(<TemplateImage section={section} editable field="image_url" sizes="100vw" alt="사진" />)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('사진 하나인 칸 — 올린 주소가 저장 대기에 오르고 바로 보인다', () => {
    useEditStore.setState({ isEditMode: true })
    render(<TemplateImage section={section} editable field="image_url" sizes="100vw" alt="사진" />)
    upload('사진 변경', 'https://example.com/new.jpg')
    expect(pending('image_url')).toBe('https://example.com/new.jpg')
    expect(screen.getByAltText('사진')).toHaveAttribute('src', 'https://example.com/new.jpg')
  })

  it('목록 안 사진 — 그 항목 사진만 바꾸고 나머지 항목 · 칸은 그대로', () => {
    useEditStore.setState({ isEditMode: true })
    render(<TemplateImage section={section} editable item={{ field: 'slides', index: 1 }} sizes="100vw" alt="둘" />)
    upload('2번 사진 변경', 'https://example.com/s2-new.jpg')
    const saved = JSON.parse(pending('slides') ?? '[]')
    expect(saved[0]).toEqual(SLIDES[0])
    expect(saved[1]).toEqual({ ...SLIDES[1], image_url: 'https://example.com/s2-new.jpg' })
  })

  it('같은 목록에서 사진 두 장을 차례로 바꿔도 앞서 바꾼 사진이 남는다', () => {
    useEditStore.setState({ isEditMode: true })
    render(
      <>
        <TemplateImage section={section} editable item={{ field: 'slides', index: 0 }} sizes="100vw" alt="하나" />
        <TemplateImage section={section} editable item={{ field: 'slides', index: 1 }} sizes="100vw" alt="둘" />
      </>,
    )
    upload('1번 사진 변경', 'https://example.com/a.jpg')
    upload('2번 사진 변경', 'https://example.com/b.jpg')
    const saved = JSON.parse(pending('slides') ?? '[]')
    expect(saved.map((s: { image_url: string }) => s.image_url)).toEqual([
      'https://example.com/a.jpg',
      'https://example.com/b.jpg',
    ])
    expect(screen.getByAltText('하나')).toHaveAttribute('src', 'https://example.com/a.jpg')
  })

  it('휴대폰 사진 — 항목의 휴대폰용 칸만 바꾼다', () => {
    useEditStore.setState({ isEditMode: true })
    render(
      <TemplateImage
        section={section}
        editable
        item={{ field: 'slides', index: 1 }}
        mobileKey="mobile_image_url"
        sizes="100vw"
        alt="둘"
      />,
    )
    upload('휴대폰 사진', 'https://example.com/m-new.jpg')
    const saved = JSON.parse(pending('slides') ?? '[]')
    expect(saved[1].image_url).toBe(SLIDES[1].image_url)
    expect(saved[1].mobile_image_url).toBe('https://example.com/m-new.jpg')
  })

  it('카드 링크 안의 버튼 — 눌러도 페이지 이동 없이 업로드 창만', () => {
    useEditStore.setState({ isEditMode: true })
    const onLinkClick = vi.fn()
    render(
      <a href="/next" onClick={onLinkClick}>
        <TemplateImage section={section} editable item={{ field: 'slides', index: 0 }} sizes="100vw" alt="하나" />
      </a>,
    )
    const button = screen.getByRole('button', { name: '1번 사진 변경' })
    const event = new MouseEvent('click', { bubbles: true, cancelable: true })
    act(() => {
      button.dispatchEvent(event)
    })
    expect(event.defaultPrevented).toBe(true)
    expect(onLinkClick).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('ImageEditButtons — 버튼 글자 · 위치 class 를 바꿀 수 있다 (메인 슬라이드)', () => {
    useEditStore.setState({ isEditMode: true })
    render(
      <ImageEditButtons
        section={section}
        editable
        item={{ field: 'slides', index: 0 }}
        label="1번 슬라이드 사진 변경"
        className="tpl-image-edit-group--below-header"
      />,
    )
    const button = screen.getByRole('button', { name: '1번 슬라이드 사진 변경' })
    expect(button.parentElement).toHaveClass('tpl-image-edit-group', 'tpl-image-edit-group--below-header')
  })
})
