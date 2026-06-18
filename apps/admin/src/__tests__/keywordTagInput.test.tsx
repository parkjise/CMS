import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { KeywordTagInput } from '@/components/seo/KeywordTagInput'

function Wrapper({
  initial = [] as string[],
  onChange = vi.fn(),
  max,
}: {
  initial?: string[]
  onChange?: (next: string[]) => void
  max?: number
}) {
  return <KeywordTagInput keywords={initial} onChange={onChange} max={max} />
}

describe('KeywordTagInput', () => {
  it('엔터 키로 키워드 추가', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Wrapper onChange={onChange} />)

    const input = screen.getByPlaceholderText(/키워드 입력/)
    await user.type(input, '강남{Enter}')

    expect(onChange).toHaveBeenCalledWith(['강남'])
  })

  it('쉼표로도 추가', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Wrapper onChange={onChange} />)

    await user.type(screen.getByPlaceholderText(/키워드 입력/), '의원,')
    expect(onChange).toHaveBeenCalledWith(['의원'])
  })

  it('빈 문자열은 추가되지 않음', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Wrapper onChange={onChange} />)

    await user.type(screen.getByPlaceholderText(/키워드 입력/), '   {Enter}')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('× 버튼으로 키워드 삭제', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Wrapper initial={['강남', '의원']} onChange={onChange} />)

    await user.click(screen.getByLabelText('강남 삭제'))
    expect(onChange).toHaveBeenCalledWith(['의원'])
  })

  it('최대 개수 초과 시 무시', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Wrapper initial={['a', 'b']} onChange={onChange} max={2} />)

    const input = screen.getByDisplayValue('')
    await user.type(input, 'c{Enter}')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('중복 키워드는 추가되지 않음', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Wrapper initial={['강남']} onChange={onChange} />)

    const input = screen.getByDisplayValue('')
    await user.type(input, '강남{Enter}')
    expect(onChange).not.toHaveBeenCalled()
  })
})
