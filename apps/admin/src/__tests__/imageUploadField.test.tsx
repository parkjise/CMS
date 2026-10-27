import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { AxiosError, AxiosHeaders } from 'axios'
import { renderWithQuery } from './renderWithQuery'
import { api } from '@/lib/api'
import { ImageUploadField } from '@/components/content/forms/ImageUploadField'
import { checkImageFile, formatKb } from '@/lib/imageFile'

// 관리자 섹션 이미지 업로드 — 끌어다 놓기 · 파일 선택 (기획서 AD-02-B, T-037-B)
// jsdom 의 MSW 는 multipart 본문을 못 읽어 api.post 를 대신한다 (multipart 헤더는 uploadImage.test)

const { toastSuccess, toastError, toastInfo } = vi.hoisted(() => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  toastInfo: vi.fn(),
}))
vi.mock('@cms/ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@cms/ui')>()
  return { ...actual, toast: { success: toastSuccess, error: toastError, info: toastInfo } }
})

const NEW_URL = 'http://localhost:9000/cms-images/t/hero/s/new.webp'

let uploads: number
let lastContext: string | null

beforeEach(() => {
  toastSuccess.mockReset()
  toastError.mockReset()
  toastInfo.mockReset()
  uploads = 0
  lastContext = null
  vi.restoreAllMocks()
  vi.spyOn(api, 'post').mockImplementation(async (_url, body) => {
    uploads += 1
    lastContext = (body as FormData).get('context') as string
    return {
      data: {
        success: true,
        data: { id: 'f1', url: NEW_URL, original_size_kb: 8396.8, optimized_size_kb: 340 },
      },
    }
  })
})

const file = (name: string, type: string, bytes = 1024) =>
  new File([new Uint8Array(bytes)], name, { type })

/** 폼처럼 값을 들고 있는 감싸개 */
function Harness({ initial = '' }: { initial?: string }) {
  const [value, setValue] = useState(initial)
  return (
    <>
      <ImageUploadField
        label="배경 이미지"
        value={value}
        onChange={setValue}
        sectionId="sec-1"
        context="hero"
      />
      <output data-testid="value">{value}</output>
    </>
  )
}

describe('checkImageFile · formatKb', () => {
  it('형식 · 크기 검사', () => {
    expect(checkImageFile(file('a.jpg', 'image/jpeg'))).toBeNull()
    expect(checkImageFile(file('a.gif', 'image/gif'))).toBeNull()
    expect(checkImageFile(file('a.pdf', 'application/pdf'))).toBe('JPG, PNG, WebP, GIF만 가능합니다')
    const huge = file('big.png', 'image/png')
    Object.defineProperty(huge, 'size', { value: 21 * 1024 * 1024 })
    expect(checkImageFile(huge)).toBe('파일이 너무 큽니다 (최대 20MB)')
  })

  it('크기 표시', () => {
    expect(formatKb(340)).toBe('340KB')
    expect(formatKb(8396.8)).toBe('8.2MB')
  })
})

describe('ImageUploadField', () => {
  it('파일을 고르면 올리고, 주소가 폼 값이 되며 최적화 결과를 알려 준다', async () => {
    const user = userEvent.setup()
    renderWithQuery(<Harness />)
    expect(screen.getByText('등록된 이미지가 없습니다.')).toBeInTheDocument()

    await user.upload(screen.getByTestId('hero-file-input'), file('banner.jpg', 'image/jpeg'))

    await waitFor(() => expect(screen.getByTestId('value')).toHaveTextContent(NEW_URL))
    expect(lastContext).toBe('hero')
    expect(screen.getByText('✅ 8.2MB → 340KB로 최적화되었습니다.')).toBeInTheDocument()
    expect(toastSuccess).toHaveBeenCalledWith(expect.stringContaining('저장을 눌러 반영하세요'))
    expect(screen.getByAltText('현재 이미지')).toHaveAttribute('src', NEW_URL)
  })

  it('끌어다 놓아도 올라간다', async () => {
    renderWithQuery(<Harness />)
    const zone = screen.getByRole('button', { name: /배경 이미지 업로드/ })
    fireEvent.dragOver(zone)
    fireEvent.drop(zone, { dataTransfer: { files: [file('drop.png', 'image/png')] } })
    await waitFor(() => expect(screen.getByTestId('value')).toHaveTextContent(NEW_URL))
  })

  it('지원하지 않는 형식은 올리지 않고 안내', async () => {
    renderWithQuery(<Harness />)
    const zone = screen.getByRole('button', { name: /배경 이미지 업로드/ })
    fireEvent.drop(zone, { dataTransfer: { files: [file('doc.pdf', 'application/pdf')] } })
    expect(toastError).toHaveBeenCalledWith('JPG, PNG, WebP, GIF만 가능합니다')
    expect(uploads).toBe(0)
  })

  it('20MB 초과는 거절, 5MB 초과는 자동 최적화 안내 후 업로드', async () => {
    renderWithQuery(<Harness />)
    const zone = screen.getByRole('button', { name: /배경 이미지 업로드/ })

    const huge = file('huge.jpg', 'image/jpeg')
    Object.defineProperty(huge, 'size', { value: 21 * 1024 * 1024 })
    fireEvent.drop(zone, { dataTransfer: { files: [huge] } })
    expect(toastError).toHaveBeenCalledWith('파일이 너무 큽니다 (최대 20MB)')
    expect(uploads).toBe(0)

    const large = file('large.jpg', 'image/jpeg')
    Object.defineProperty(large, 'size', { value: 8 * 1024 * 1024 })
    fireEvent.drop(zone, { dataTransfer: { files: [large] } })
    expect(toastInfo).toHaveBeenCalledWith('이미지가 큽니다. 자동으로 최적화됩니다.')
    await waitFor(() => expect(uploads).toBe(1))
  })

  it('서버 오류(저장 공간 한도 등)는 그 안내를 보여 주고 값은 그대로', async () => {
    vi.spyOn(api, 'post').mockRejectedValue(
      new AxiosError('limit', 'ERR_BAD_REQUEST', undefined, undefined, {
        status: 422,
        statusText: 'Unprocessable',
        headers: {},
        config: { headers: new AxiosHeaders() },
        data: {
          success: false,
          error: { code: 'PLAN_LIMIT_EXCEEDED', message: '저장 공간 한도를 초과했습니다' },
        },
      }),
    )
    const user = userEvent.setup()
    renderWithQuery(<Harness initial="https://old.example.com/a.webp" />)
    await user.upload(screen.getByTestId('hero-file-input'), file('a.jpg', 'image/jpeg'))
    await waitFor(() => expect(toastError).toHaveBeenCalledWith('저장 공간 한도를 초과했습니다'))
    expect(screen.getByTestId('value')).toHaveTextContent('https://old.example.com/a.webp')
  })

  it('삭제하면 값이 비고, 주소로 넣기도 된다', async () => {
    const user = userEvent.setup()
    renderWithQuery(<Harness initial="https://old.example.com/a.webp" />)
    await user.click(screen.getByRole('button', { name: '배경 이미지 삭제' }))
    expect(screen.getByTestId('value')).toBeEmptyDOMElement()

    await user.click(screen.getByRole('button', { name: '주소로 넣기' }))
    await user.type(screen.getByLabelText('배경 이미지 주소'), 'https://cdn.example.com/b.jpg')
    expect(screen.getByTestId('value')).toHaveTextContent('https://cdn.example.com/b.jpg')
  })
})
