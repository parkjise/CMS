import { describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithQuery } from './renderWithQuery'
import { ListField } from '@/components/content/forms/ListField'
import { GenericForm } from '@/components/content/forms/GenericForm'
import { parseList } from '@/components/content/forms/listValue'
import type { Section } from '@/hooks/useSections'

// 관리자 목록 칸 편집기 (T-037-E)

function Harness({ initial, field = 'cards', extraKeys }: { initial: unknown[]; field?: string; extraKeys?: string[] }) {
  const [value, setValue] = useState(JSON.stringify(initial))
  return (
    <>
      <ListField field={field} value={value} onChange={setValue} sectionId="s1" extraKeys={extraKeys} />
      <output data-testid="json">{value}</output>
    </>
  )
}

const json = () => JSON.parse(screen.getByTestId('json').textContent ?? '[]')

describe('parseList', () => {
  it('글자 목록 · 항목 목록만 목록으로, 그 밖은 null', () => {
    expect(parseList('["a","b"]')).toEqual(['a', 'b'])
    expect(parseList('[{"title":"x"}]')).toEqual([{ title: 'x' }])
    expect(parseList('[]')).toEqual([])
    expect(parseList('[1, "a"]')).toBeNull()
    expect(parseList('[[1]]')).toBeNull()
    expect(parseList('제목')).toBeNull()
    expect(parseList('[깨짐')).toBeNull()
  })
})

describe('ListField', () => {
  it('항목 칸을 고치고, 추가 · 순서 · 삭제가 JSON 에 반영된다', async () => {
    const user = userEvent.setup()
    renderWithQuery(
      <Harness
        initial={[
          { title: '첫 카드', description: '설명1', link_url: '/a', pinned: false },
          { title: '둘째 카드', description: '설명2', link_url: '/b', pinned: true },
        ]}
      />,
    )
    expect(screen.getByText('(2개)')).toBeInTheDocument()

    const title = screen.getByLabelText('카드 1 제목')
    await user.clear(title)
    await user.type(title, '새 제목')
    expect(json()[0].title).toBe('새 제목')
    // 긴 글은 여러 줄 입력, 예/아니오는 체크박스
    expect(screen.getByLabelText('카드 2 설명').tagName).toBe('TEXTAREA')
    expect(screen.getByLabelText('카드 2 pinned')).toBeChecked()

    await user.click(screen.getByRole('button', { name: '카드 추가' }))
    expect(json()).toHaveLength(3)
    expect(json()[2]).toEqual({ title: '', description: '', link_url: '', pinned: false })

    await user.click(screen.getByRole('button', { name: '카드 2 위로' }))
    expect(json().map((c: { title: string }) => c.title)).toEqual(['둘째 카드', '새 제목', ''])

    await user.click(screen.getByRole('button', { name: '카드 3 삭제' }))
    expect(json()).toHaveLength(2)
  })

  it('글자 목록은 한 줄 입력 여러 개', async () => {
    const user = userEvent.setup()
    renderWithQuery(<Harness field="values" initial={['정성', '신뢰']} />)
    const second = screen.getByLabelText('가치 2 내용')
    await user.clear(second)
    await user.type(second, '책임')
    await user.click(screen.getByRole('button', { name: '가치 추가' }))
    expect(json()).toEqual(['정성', '책임', ''])
  })

  it('사진 칸은 업로드 칸, 늘 보일 칸(휴대폰용 사진)이 항목마다 나온다', () => {
    renderWithQuery(
      <Harness field="slides" initial={[{ image_url: '/s1.jpg', title: '슬라이드' }]} extraKeys={['mobile_image_url']} />,
    )
    expect(screen.getByText('슬라이드 1 사진')).toBeInTheDocument()
    expect(screen.getByText('슬라이드 1 휴대폰용 사진')).toBeInTheDocument()
  })
})

const section = (type: string, settings: Record<string, string>): Section =>
  ({
    id: 'sec-1',
    tenant_id: 't-1',
    section_type: type,
    label: '섹션',
    display_order: 0,
    is_active: true,
    page_key: 'home',
    settings: Object.entries(settings).map(([field_key, field_value]) => ({
      field_key,
      field_value,
      value_type: field_value.startsWith('[') ? 'JSON' : 'STRING',
      is_sample: false,
    })),
  }) as unknown as Section

describe('GenericForm 목록 칸', () => {
  it('슬라이드는 목록 편집기로, 저장은 JSON 으로 · 일반 칸은 읽기 쉬운 이름', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderWithQuery(
      <GenericForm
        section={section('HERO_SLIDER', {
          en_title: 'Hello',
          slides: JSON.stringify([{ image_url: '/s1.jpg', title: '첫 슬라이드' }]),
        })}
        isSaving={false}
        onSubmit={onSubmit}
      />,
    )
    expect(screen.getByLabelText('영문 제목')).toHaveValue('Hello')
    await user.click(screen.getByRole('button', { name: '슬라이드 추가' }))
    await user.click(screen.getByRole('button', { name: /저장/ }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    const slides = onSubmit.mock.calls[0][0].find((s: { field_key: string }) => s.field_key === 'slides')
    expect(slides.value_type).toBe('JSON')
    const saved = JSON.parse(slides.field_value)
    expect(saved).toHaveLength(2)
    // 새 슬라이드는 휴대폰용 사진 칸까지 같은 모양
    expect(Object.keys(saved[1]).sort()).toEqual(
      ['copy_primary', 'copy_secondary', 'image_url', 'mobile_image_url', 'title'].sort(),
    )
  })

  it('게시판 샘플 글은 목록 편집기로 보이지 않는다', () => {
    renderWithQuery(
      <GenericForm
        section={section('BOARD', { items: JSON.stringify([{ subject: '공지' }]) })}
        isSaving={false}
        onSubmit={vi.fn()}
      />,
    )
    expect(screen.queryByRole('button', { name: '항목 추가' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('항목')).toHaveValue(JSON.stringify([{ subject: '공지' }]))
  })
})
