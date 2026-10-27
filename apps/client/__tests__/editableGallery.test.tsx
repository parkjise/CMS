import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { AxiosError, AxiosHeaders } from 'axios'
import { toast } from 'sonner'
import { Gallery } from '@/components/sections/Gallery'
import { GALLERY_MAX_ITEMS } from '@/components/edit/EditableGallery'
import { useEditStore } from '@/lib/editStore'
import { useClientAuthStore } from '@/lib/authStore'
import { uploadImage } from '@/lib/uploadImage'
import type { PublicSection } from '@/lib/publicSite.types'

/** 갤러리 다중 이미지 인라인 편집 (T-064-A) */

vi.mock('next/image', () => ({
  __esModule: true,
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/uploadImage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/uploadImage')>()
  return { ...actual, uploadImage: vi.fn() }
})

const upload = vi.mocked(uploadImage)
const SECTION_ID = 'gal-1'
const KEY = `${SECTION_ID}:gallery_items`

const item = (n: number, caption = '') => ({
  image_url: `https://cdn.example.com/${n}.webp`,
  caption,
})

const section = (items: unknown[]): PublicSection => ({
  id: SECTION_ID,
  section_type: 'GALLERY',
  label: '갤러리',
  display_order: 1,
  is_active: true,
  settings: [
    { field_key: 'section_title', field_value: '시설 갤러리' },
    { field_key: 'gallery_items', field_value: JSON.stringify(items) },
  ] as PublicSection['settings'],
})

const imageFile = (name: string) => new File(['x'], name, { type: 'image/png' })

const pendingItems = () =>
  JSON.parse(useEditStore.getState().pendingChanges[KEY]?.new_value ?? 'null')

const enableEditMode = () => {
  useClientAuthStore.setState({ isLoggedIn: true })
  useEditStore.setState({ isEditMode: true })
}

const selectFiles = (files: File[]) =>
  fireEvent.change(screen.getByLabelText('갤러리 사진 선택'), { target: { files } })

beforeEach(() => {
  vi.clearAllMocks()
  useEditStore.setState({ isEditMode: false, pendingChanges: {}, isDirty: false })
  useClientAuthStore.setState({ user: null, isLoggedIn: false })
})
afterEach(cleanup)

describe('Gallery — 방문자 화면', () => {
  it('편집 모드가 아니면 편집 버튼 없이 사진만 보여 준다', () => {
    render(<Gallery section={section([item(1, '로비')])} tenantSlug="t" />)
    expect(screen.getByAltText('로비')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /사진 추가/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '사진 삭제' })).not.toBeInTheDocument()
  })
})

describe('Gallery — 편집 모드', () => {
  it('사진 추가 · 장수 표시와 사진별 편집 버튼을 보여 준다', () => {
    enableEditMode()
    render(<Gallery section={section([item(1), item(2)])} tenantSlug="t" />)
    expect(screen.getByRole('button', { name: /사진 추가/ })).toBeEnabled()
    expect(screen.getByText(`2 / ${GALLERY_MAX_ITEMS}장`, { exact: false })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: '사진 삭제' })).toHaveLength(2)
  })

  it('여러 장을 순서대로 올려 목록 끝에 붙인다', async () => {
    enableEditMode()
    upload
      .mockResolvedValueOnce({ url: 'https://cdn.example.com/new-a.webp' } as never)
      .mockResolvedValueOnce({ url: 'https://cdn.example.com/new-b.webp' } as never)
    render(<Gallery section={section([item(1)])} tenantSlug="t" />)

    selectFiles([imageFile('a.png'), imageFile('b.png')])

    await waitFor(() => expect(pendingItems()).toHaveLength(3))
    expect(upload).toHaveBeenCalledTimes(2)
    expect(upload).toHaveBeenNthCalledWith(1, expect.any(File), SECTION_ID, 'gallery')
    expect(pendingItems().map((i: { image_url: string }) => i.image_url)).toEqual([
      item(1).image_url,
      'https://cdn.example.com/new-a.webp',
      'https://cdn.example.com/new-b.webp',
    ])
    expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('2장'))
  })

  it('일부 업로드가 실패하면 성공한 것만 붙이고 실패 장수를 알린다', async () => {
    enableEditMode()
    upload
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce({ url: 'https://cdn.example.com/ok.webp' } as never)
    render(<Gallery section={section([])} tenantSlug="t" />)

    // 이미지가 아닌 파일은 올리지 않고 실패로 센다
    selectFiles([imageFile('a.png'), imageFile('b.png'), new File(['x'], 'a.txt', { type: 'text/plain' })])

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('사진 2장은 올리지 못했습니다.'))
    expect(upload).toHaveBeenCalledTimes(2)
    expect(pendingItems()).toEqual([{ image_url: 'https://cdn.example.com/ok.webp', caption: '' }])
  })

  it('저장 공간 한도(422)면 남은 업로드를 멈추고 이유를 알린다', async () => {
    enableEditMode()
    const limit = new AxiosError('limit', '422', undefined, undefined, {
      status: 422,
      statusText: '',
      headers: {},
      config: { headers: new AxiosHeaders() },
      data: { success: false, error: { code: 'PLAN_LIMIT_EXCEEDED', message: '저장 공간 한도 초과' } },
    })
    upload.mockRejectedValueOnce(limit)
    render(<Gallery section={section([])} tenantSlug="t" />)

    selectFiles([imageFile('a.png'), imageFile('b.png'), imageFile('c.png')])

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('저장 공간 한도 초과'))
    expect(upload).toHaveBeenCalledTimes(1)
    expect(toast.error).toHaveBeenCalledWith('사진 3장은 올리지 못했습니다.')
    expect(pendingItems()).toBeNull()
  })

  it(`최대 ${GALLERY_MAX_ITEMS}장을 넘는 파일은 제외한다`, async () => {
    enableEditMode()
    const full = Array.from({ length: GALLERY_MAX_ITEMS - 1 }, (_, i) => item(i))
    upload.mockResolvedValue({ url: 'https://cdn.example.com/last.webp' } as never)
    render(<Gallery section={section(full)} tenantSlug="t" />)

    selectFiles([imageFile('a.png'), imageFile('b.png'), imageFile('c.png')])

    await waitFor(() => expect(pendingItems()).toHaveLength(GALLERY_MAX_ITEMS))
    expect(upload).toHaveBeenCalledTimes(1)
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('2장은 제외'))
  })

  it('가득 차면 사진 추가 버튼을 막는다', () => {
    enableEditMode()
    const full = Array.from({ length: GALLERY_MAX_ITEMS }, (_, i) => item(i))
    render(<Gallery section={section(full)} tenantSlug="t" />)
    expect(screen.getByRole('button', { name: /사진 추가/ })).toBeDisabled()
  })

  it('순서 변경 · 삭제 · 캡션 수정이 저장 대기 목록에 반영된다', () => {
    enableEditMode()
    render(<Gallery section={section([item(1), item(2), item(3)])} tenantSlug="t" />)

    const second = screen.getByRole('listitem', { name: '갤러리 사진 2' })
    fireEvent.click(within(second).getByRole('button', { name: '앞으로 이동' }))
    expect(pendingItems().map((i: { image_url: string }) => i.image_url)).toEqual([
      item(2).image_url,
      item(1).image_url,
      item(3).image_url,
    ])

    fireEvent.click(
      within(screen.getByRole('listitem', { name: '갤러리 사진 3' })).getByRole('button', {
        name: '사진 삭제',
      }),
    )
    expect(pendingItems()).toHaveLength(2)

    fireEvent.change(screen.getByLabelText('사진 1 캡션'), { target: { value: '외관' } })
    expect(pendingItems()[0]).toEqual({ ...item(2), caption: '외관' })

    // 원래 값은 바뀌기 전 목록 — 되돌리기 · 비교용
    expect(JSON.parse(useEditStore.getState().pendingChanges[KEY].original_value)).toHaveLength(3)
  })

  it('첫 사진은 앞으로, 마지막 사진은 뒤로 못 옮긴다', () => {
    enableEditMode()
    render(<Gallery section={section([item(1), item(2)])} tenantSlug="t" />)
    const first = screen.getByRole('listitem', { name: '갤러리 사진 1' })
    const last = screen.getByRole('listitem', { name: '갤러리 사진 2' })
    expect(within(first).getByRole('button', { name: '앞으로 이동' })).toBeDisabled()
    expect(within(last).getByRole('button', { name: '뒤로 이동' })).toBeDisabled()
  })

  it('편집 모드를 나가도 저장 전 변경은 화면에 남는다', () => {
    useEditStore.setState({
      isEditMode: false,
      pendingChanges: {
        [KEY]: {
          section_id: SECTION_ID,
          field: 'gallery_items',
          original_value: '[]',
          new_value: JSON.stringify([item(9, '새 사진')]),
          changed_at: '2026-10-27T00:00:00Z',
        },
      },
    })
    render(<Gallery section={section([item(1, '옛 사진')])} tenantSlug="t" />)
    expect(screen.getByAltText('새 사진')).toBeInTheDocument()
    expect(screen.queryByAltText('옛 사진')).not.toBeInTheDocument()
  })
})
