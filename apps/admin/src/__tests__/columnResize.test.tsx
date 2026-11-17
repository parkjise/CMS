import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ColumnResizeHandle } from '@/components/boards/ColumnResizeHandle'
import { clampColumnWidth, tableColumnWidth, toTableLayout } from '@/stores/postTableLayoutStore'

const renderHandle = (width = 160) => {
  const onPreview = vi.fn()
  const onCommit = vi.fn()
  const onReset = vi.fn()
  render(
    <ColumnResizeHandle
      label="메모"
      width={width}
      onPreview={onPreview}
      onCommit={onCommit}
      onReset={onReset}
    />
  )
  return {
    handle: screen.getByRole('separator', { name: '메모 열 넓이' }),
    onPreview,
    onCommit,
    onReset,
  }
}

describe('열 넓이 끌어서 조절 (T-215)', () => {
  it('끄는 동안은 미리보기, 놓으면 저장', () => {
    const { handle, onPreview, onCommit } = renderHandle(160)
    fireEvent.pointerDown(handle, { clientX: 100, pointerId: 1 })
    fireEvent.pointerMove(handle, { clientX: 140, pointerId: 1 })
    expect(onPreview).toHaveBeenLastCalledWith(200)
    expect(onCommit).not.toHaveBeenCalled()
    fireEvent.pointerUp(handle, { clientX: 140, pointerId: 1 })
    expect(onCommit).toHaveBeenCalledWith(200)
  })

  it('최소 96 · 최대 640px', () => {
    const { handle, onCommit } = renderHandle(160)
    fireEvent.pointerDown(handle, { clientX: 500, pointerId: 1 })
    fireEvent.pointerMove(handle, { clientX: 0, pointerId: 1 })
    fireEvent.pointerUp(handle, { pointerId: 1 })
    expect(onCommit).toHaveBeenLastCalledWith(96)
    expect(clampColumnWidth(9999)).toBe(640)
  })

  it('움직이지 않고 놓으면 저장하지 않는다', () => {
    const { handle, onCommit } = renderHandle()
    fireEvent.pointerDown(handle, { clientX: 100, pointerId: 1 })
    fireEvent.pointerUp(handle, { pointerId: 1 })
    expect(onCommit).not.toHaveBeenCalled()
  })

  it('키보드 ← / → 16px, 더블클릭은 원래 크기', () => {
    const { handle, onCommit, onReset } = renderHandle(160)
    fireEvent.keyDown(handle, { key: 'ArrowRight' })
    expect(onCommit).toHaveBeenLastCalledWith(176)
    fireEvent.keyDown(handle, { key: 'ArrowLeft' })
    expect(onCommit).toHaveBeenLastCalledWith(144)
    fireEvent.doubleClick(handle)
    expect(onReset).toHaveBeenCalled()
    expect(handle).toHaveAttribute('aria-valuenow', '160')
  })

  it('저장값: 넓이가 있으면 크기보다 먼저, 범위 밖 · 예전 값은 무시', () => {
    const layout = toTableLayout({
      order: ['a', 'b'],
      sizes: { a: 'wide', b: 'narrow' },
      widths: { a: 300, b: 50, c: 'x' },
    })
    expect(layout).toEqual({
      order: ['a', 'b'],
      sizes: { a: 'wide', b: 'narrow' },
      widths: { a: 300 },
    })
    expect(tableColumnWidth(layout!, 'a')).toBe(300)
    expect(tableColumnWidth(layout!, 'b')).toBe(128)
    // 예전 저장값(넓이 없음)은 모양 그대로
    expect(toTableLayout({ order: ['a'], sizes: {} })).toEqual({ order: ['a'], sizes: {} })
  })
})

describe('열 순서 · 크기 설정과 함께 (T-215)', () => {
  it('순서를 바꿔도 끌어서 정한 넓이는 남고, 크기를 고르면 그 열 넓이는 지운다', async () => {
    const { PostTableLayoutControls } = await import('@/components/boards/PostTableLayoutControls')
    const onSave = vi.fn()
    const fields = [
      { id: 'a', label: '메모' },
      { id: 'b', label: '수량' },
    ] as never
    render(
      <PostTableLayoutControls
        scope="s"
        fields={fields}
        layout={{ order: ['a', 'b'], sizes: {}, widths: { a: 300, b: 200 } }}
        onSave={onSave}
        serverFailed={false}
        onRetryServer={vi.fn()}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: '수량 열 앞으로', hidden: true }))
    expect(onSave.mock.lastCall![0]).toMatchObject({
      order: ['b', 'a'],
      widths: { a: 300, b: 200 },
    })
    fireEvent.change(screen.getByRole('combobox', { name: '메모 열 크기', hidden: true }), {
      target: { value: 'wide' },
    })
    expect(onSave.mock.lastCall![0].widths).toEqual({ b: 200 })
  })
})
