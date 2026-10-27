import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AxiosError, AxiosHeaders } from 'axios'
import { GalleryForm } from '@/components/content/forms/GalleryForm'
import type { Section } from '@/hooks/useSections'

/** 관리자 갤러리 폼 — 여러 장 업로드 · 순서 · 캡션 (T-064-A) */

// jsdom 은 multipart 요청을 MSW 로 넘기지 못한다 — 업로드 함수만 바꿔 끼운다
// (multipart 헤더 자체는 uploadImage.test.ts 에서, 실제 업로드는 브라우저로 확인)
const upload = vi.hoisted(() => vi.fn())
vi.mock('@/hooks/useUploadImage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useUploadImage')>()
  const { useMutation } = await import('@tanstack/react-query')
  return { ...actual, useUploadImage: () => useMutation({ mutationFn: upload }) }
})

const item = (n: number, caption = '') => ({
  image_url: `https://cdn.example.com/${n}.webp`,
  caption,
})

const section = (items: unknown[]): Section => ({
  id: 'gal-1',
  tenant_id: 't-1',
  section_type: 'GALLERY',
  label: '갤러리',
  display_order: 0,
  is_active: true,
  settings: [
    { field_key: 'gallery_items', field_value: JSON.stringify(items), value_type: 'JSON' },
  ],
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
} as Section)

const renderForm = (items: unknown[] = []) => {
  const onSubmit = vi.fn().mockResolvedValue(undefined)
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>
      <GalleryForm section={section(items)} isSaving={false} onSubmit={onSubmit} />
    </QueryClientProvider>
  )
  return onSubmit
}

const savedItems = (onSubmit: ReturnType<typeof vi.fn>) => {
  const settings = onSubmit.mock.calls[0][0] as Array<{ field_key: string; field_value: string }>
  return JSON.parse(settings.find((s) => s.field_key === 'gallery_items')!.field_value)
}

const imageFile = (name: string) => new File(['x'], name, { type: 'image/png' })

describe('GalleryForm', () => {
  it('여러 장을 업로드해 목록에 붙이고 저장한다', async () => {
    let n = 0
    upload.mockImplementation(async ({ context }: { context: string }) => {
      expect(context).toBe('gallery')
      n += 1
      return { id: `f${n}`, url: `https://cdn.example.com/up-${n}.webp` }
    })
    const onSubmit = renderForm([item(1)])

    fireEvent.change(screen.getByLabelText('갤러리 사진 선택'), {
      target: { files: [imageFile('a.png'), imageFile('b.png')] },
    })
    await screen.findByRole('listitem', { name: '갤러리 사진 3' })
    expect(n).toBe(2)
    expect(screen.getByText('3 / 30장')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '변경사항 저장' }))
    expect(savedItems(onSubmit)).toEqual([
      item(1),
      { image_url: 'https://cdn.example.com/up-1.webp', caption: '' },
      { image_url: 'https://cdn.example.com/up-2.webp', caption: '' },
    ])
  })

  it('저장 공간 한도(422)면 멈추고 남은 파일은 올리지 않는다', async () => {
    let calls = 0
    upload.mockImplementation(async () => {
      calls += 1
      throw new AxiosError('limit', '422', undefined, undefined, {
        status: 422,
        statusText: '',
        headers: {},
        config: { headers: new AxiosHeaders() },
        data: { success: false, error: { code: 'PLAN_LIMIT_EXCEEDED', message: '저장 공간 초과' } },
      })
    })
    renderForm()
    fireEvent.change(screen.getByLabelText('갤러리 사진 선택'), {
      target: { files: [imageFile('a.png'), imageFile('b.png')] },
    })
    await waitFor(() => expect(screen.getByRole('button', { name: /사진 업로드/ })).toBeEnabled())
    expect(calls).toBe(1)
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument()
  })

  it('순서 변경 · 캡션 수정 · 삭제 · 빈 주소 행 제외가 저장에 반영된다', async () => {
    const user = userEvent.setup()
    const onSubmit = renderForm([item(1), item(2), item(3)])

    // 드래그 손잡이도 있지만 jsdom 은 좌표 계산이 없어 위 · 아래 버튼으로 검증
    expect(screen.getByRole('button', { name: '사진 1 순서 변경' })).toBeInTheDocument()
    await user.click(
      within(screen.getByRole('listitem', { name: '갤러리 사진 1' })).getByRole('button', {
        name: '아래로 이동',
      })
    )

    await user.type(screen.getByLabelText('사진 1 캡션'), ' 외관 ')
    await user.click(
      within(screen.getByRole('listitem', { name: '갤러리 사진 3' })).getByRole('button', {
        name: '삭제',
      })
    )
    await user.click(screen.getByRole('button', { name: /주소로 추가/ }))
    await user.click(screen.getByRole('button', { name: '변경사항 저장' }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    expect(savedItems(onSubmit)).toEqual([item(2, '외관'), item(1)])
  })

  it('첫 행은 위로, 마지막 행은 아래로 못 옮긴다', () => {
    renderForm([item(1), item(2)])
    const first = screen.getByRole('listitem', { name: '갤러리 사진 1' })
    const last = screen.getByRole('listitem', { name: '갤러리 사진 2' })
    expect(within(first).getByRole('button', { name: '위로 이동' })).toBeDisabled()
    expect(within(last).getByRole('button', { name: '아래로 이동' })).toBeDisabled()
  })

  it('30장이면 업로드 · 주소 추가를 막는다', () => {
    renderForm(Array.from({ length: 30 }, (_, i) => item(i)))
    expect(screen.getByRole('button', { name: /사진 업로드/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /주소로 추가/ })).toBeDisabled()
  })
})
