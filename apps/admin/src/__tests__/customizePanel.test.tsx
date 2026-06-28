import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ColorPicker, FontSelector, isValidHex } from '@cms/ui'
import { CustomizePanel } from '@/components/templates/CustomizePanel'

const DEFAULTS = {
  primary: '#1a73e8',
  accent: '#16a34a',
  font_heading: 'Pretendard',
  font_body: 'Noto Sans KR',
}

describe('ColorPicker (T-059)', () => {
  it('프리셋 클릭 시 해당 색상으로 onChange', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<ColorPicker label="주요 색상" value="#000000" onChange={onChange} />)
    await user.click(screen.getByLabelText('프리셋 색상 #16a34a'))
    expect(onChange).toHaveBeenCalledWith('#16a34a')
  })

  it('잘못된 16진수는 오류 메시지를 표시한다', () => {
    render(<ColorPicker label="색상" value="zzz" onChange={vi.fn()} />)
    expect(screen.getByText(/올바른 16진수/)).toBeInTheDocument()
  })

  it('isValidHex 헬퍼 동작', () => {
    expect(isValidHex('#1a73e8')).toBe(true)
    expect(isValidHex('#abc')).toBe(true)
    expect(isValidHex('1a73e8')).toBe(false)
    expect(isValidHex('#xyz')).toBe(false)
  })
})

describe('FontSelector (T-059)', () => {
  it('폰트 변경 시 onChange 호출', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <FontSelector label="제목 폰트" value="Pretendard" onChange={onChange} />,
    )
    await user.selectOptions(screen.getByLabelText('제목 폰트'), 'Noto Sans KR')
    expect(onChange).toHaveBeenCalledWith('Noto Sans KR')
  })
})

describe('CustomizePanel (T-059)', () => {
  it('색상 변경이 미리보기에 즉시 반영된다', async () => {
    const user = userEvent.setup()
    render(
      <CustomizePanel
        disabled={false}
        isSaving={false}
        defaults={DEFAULTS}
        onSave={vi.fn()}
      />,
    )
    const preview = screen.getByLabelText('커스터마이징 미리보기')
    const primaryHex = screen.getByLabelText('주요 색상 16진수 값')

    await user.clear(primaryHex)
    await user.type(primaryHex, '#ff0000')

    const button = within(preview).getByText('주요 버튼')
    expect(button.style.backgroundColor).toBe('rgb(255, 0, 0)')
  })

  it('저장 시 4개 css 오버라이드를 전달한다', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    render(
      <CustomizePanel
        disabled={false}
        isSaving={false}
        defaults={DEFAULTS}
        onSave={onSave}
      />,
    )
    await user.click(screen.getByRole('button', { name: /커스터마이징 저장/ }))
    expect(onSave).toHaveBeenCalledWith({
      primary: DEFAULTS.primary,
      accent: DEFAULTS.accent,
      font_heading: DEFAULTS.font_heading,
      font_body: DEFAULTS.font_body,
    })
  })

  it('"기본값으로 초기화"가 변경된 값을 되돌린다', async () => {
    const user = userEvent.setup()
    render(
      <CustomizePanel
        disabled={false}
        isSaving={false}
        defaults={DEFAULTS}
        onSave={vi.fn()}
      />,
    )
    const primaryHex = screen.getByLabelText(
      '주요 색상 16진수 값',
    ) as HTMLInputElement
    await user.clear(primaryHex)
    await user.type(primaryHex, '#ff0000')
    expect(primaryHex.value).toBe('#ff0000')

    await user.click(screen.getByText('기본값으로 초기화'))
    expect(primaryHex.value).toBe(DEFAULTS.primary)
  })

  it('disabled면 안내 문구를 표시한다', () => {
    render(
      <CustomizePanel
        disabled
        isSaving={false}
        defaults={DEFAULTS}
        onSave={vi.fn()}
      />,
    )
    expect(screen.getByText(/먼저 템플릿을 적용/)).toBeInTheDocument()
  })
})
