import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { EditableImage } from '@/components/edit/EditableImage'
import { useEditStore } from '@/lib/editStore'
import { useClientAuthStore } from '@/lib/authStore'

const SECTION_ID = 'sec-1'
const FIELD = 'intro_image_url'
const INITIAL_URL = 'https://example.com/initial.webp'

vi.mock('next/image', () => ({
  __esModule: true,
  default: ({
    src,
    alt,
    className,
  }: {
    src: string
    alt: string
    className?: string
  }) => <img src={src} alt={alt} className={className} />,
}))

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

const renderImage = (props: Partial<React.ComponentProps<typeof EditableImage>> = {}) =>
  render(
    <EditableImage
      sectionId={SECTION_ID}
      field={FIELD}
      initialUrl={INITIAL_URL}
      context="intro"
      alt="intro"
      {...props}
    />,
  )

describe('EditableImage', () => {
  beforeEach(() => {
    resetStores()
  })

  afterEach(() => {
    cleanup()
  })

  it('비편집 모드에서는 오버레이/모달 미노출', () => {
    renderImage()
    expect(screen.queryByText('이미지 변경')).toBeNull()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('편집 모드에서 "이미지 변경" 오버레이 노출', () => {
    enableEditMode()
    renderImage()
    expect(screen.getByText('이미지 변경')).toBeInTheDocument()
  })

  it('편집 모드 + 클릭 시 ImageUploadModal 오픈', () => {
    enableEditMode()
    renderImage()
    const wrapper = screen
      .getByText('이미지 변경')
      .closest('[data-editable="image"]') as HTMLElement
    fireEvent.click(wrapper)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('pendingChanges에 새 URL이 있으면 그 값을 표시 (optimistic update)', () => {
    enableEditMode()
    const newUrl = 'https://example.com/new.webp'
    useEditStore.setState({
      pendingChanges: {
        [`${SECTION_ID}:${FIELD}`]: {
          section_id: SECTION_ID,
          field: FIELD,
          original_value: INITIAL_URL,
          new_value: newUrl,
          changed_at: new Date().toISOString(),
        },
      },
      isDirty: true,
    })
    renderImage()
    const img = screen.getByAltText('intro') as HTMLImageElement
    expect(img.getAttribute('src')).toBe(newUrl)
  })
})
