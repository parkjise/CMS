import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ImageUpload, type ImageUploadResult } from '@cms/ui'

const okResult: ImageUploadResult = {
  url: 'https://cdn.example.com/t/hero/abc.webp',
  original_size_kb: 8200,
  optimized_size_kb: 340,
  width: 1920,
  height: 1080,
  format: 'webp',
}

function makeFile(name: string, type: string, sizeBytes: number): File {
  const file = new File(['x'], name, { type })
  Object.defineProperty(file, 'size', { value: sizeBytes })
  return file
}

describe('ImageUpload', () => {
  it('초기 상태에서 드롭존을 렌더링한다', () => {
    render(<ImageUpload onUpload={vi.fn()} />)
    expect(screen.getByText(/드래그하거나 클릭하여 선택/)).toBeInTheDocument()
    expect(screen.getByText(/최대 20MB/)).toBeInTheDocument()
  })

  it('유효한 파일 선택 시 onUpload를 호출하고 최적화 결과를 표시한다', async () => {
    const user = userEvent.setup()
    const onUpload = vi.fn().mockResolvedValue(okResult)

    render(<ImageUpload onUpload={onUpload} />)

    const input = screen.getByTestId('image-upload-input') as HTMLInputElement
    const file = makeFile('photo.jpg', 'image/jpeg', 5 * 1024 * 1024)
    await user.upload(input, file)

    await waitFor(() => expect(onUpload).toHaveBeenCalledTimes(1))
    expect(onUpload.mock.calls[0][0]).toBe(file)
    // 최적화 결과: 8.0MB → 340KB로 최적화
    expect(await screen.findByText(/8\.0MB → 340KB로 최적화/)).toBeInTheDocument()
    // 성공 후 미리보기 노출
    expect(screen.getByAltText('업로드된 이미지 미리보기')).toHaveAttribute('src', okResult.url)
  })

  it('20MB를 초과하는 파일은 즉시 에러를 표시하고 onUpload를 호출하지 않는다', async () => {
    const user = userEvent.setup()
    const onUpload = vi.fn().mockResolvedValue(okResult)

    render(<ImageUpload onUpload={onUpload} maxSizeMb={20} />)

    const input = screen.getByTestId('image-upload-input') as HTMLInputElement
    const big = makeFile('big.png', 'image/png', 21 * 1024 * 1024)
    await user.upload(input, big)

    expect(await screen.findByRole('alert')).toHaveTextContent(/최대 20MB/)
    expect(onUpload).not.toHaveBeenCalled()
  })

  it('지원하지 않는 형식은 에러를 표시한다', async () => {
    const onUpload = vi.fn()

    render(<ImageUpload onUpload={onUpload} />)

    const input = screen.getByTestId('image-upload-input') as HTMLInputElement
    const pdf = makeFile('doc.pdf', 'application/pdf', 1024)
    // accept 속성은 파일 선택창 힌트일 뿐 — 드래그앤드롭 등으로 우회 가능하므로
    // 컴포넌트 자체 런타임 검증을 확인 (fireEvent로 accept 필터 우회)
    fireEvent.change(input, { target: { files: [pdf] } })

    expect(await screen.findByRole('alert')).toHaveTextContent(/지원하지 않는 이미지 형식/)
    expect(onUpload).not.toHaveBeenCalled()
  })

  it('value가 있으면 미리보기와 삭제 버튼을 노출하고 삭제 시 onRemove를 호출한다', async () => {
    const user = userEvent.setup()
    const onRemove = vi.fn()

    render(
      <ImageUpload
        onUpload={vi.fn()}
        value="https://cdn.example.com/existing.webp"
        onRemove={onRemove}
      />
    )

    expect(screen.getByAltText('업로드된 이미지 미리보기')).toHaveAttribute(
      'src',
      'https://cdn.example.com/existing.webp'
    )
    await user.click(screen.getByLabelText('이미지 삭제'))
    expect(onRemove).toHaveBeenCalledTimes(1)
  })

  it('업로드 실패 시 에러 메시지를 표시한다', async () => {
    const user = userEvent.setup()
    const onUpload = vi.fn().mockRejectedValue(new Error('network'))

    render(<ImageUpload onUpload={onUpload} />)

    const input = screen.getByTestId('image-upload-input') as HTMLInputElement
    await user.upload(input, makeFile('photo.jpg', 'image/jpeg', 1024))

    expect(await screen.findByRole('alert')).toHaveTextContent(/업로드에 실패/)
  })
})
