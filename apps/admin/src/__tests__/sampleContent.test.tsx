import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { DndContext } from '@dnd-kit/core'
import { SortableContext } from '@dnd-kit/sortable'
import { ApplyConfirmDialog } from '@/components/templates/ApplyConfirmDialog'
import { SectionListItem } from '@/components/content/SectionListItem'
import { SampleReminder } from '@/components/dashboard/SampleReminder'
import { countSampleSettings, sampleKeys } from '@/lib/sampleContent'
import type { Section } from '@/hooks/useSections'
import type { TemplateItem } from '@/hooks/useTemplates'

const codeTemplate: TemplateItem = {
  id: 'tpl-code',
  template_type: 'HOSPITAL',
  name: '하스피털 A',
  description: null,
  thumbnail_url: null,
  css_variables: {},
  section_layouts: [],
  is_active: true,
  min_plan: 'BASIC',
  locked: false,
  code: 'TPL_HOSPITAL_A',
  renderer: 'code',
  styling: 'scss',
  has_sample_content: true,
}

function makeSection(id: string, samples: boolean[], active = true): Section {
  return {
    id,
    tenant_id: 't-1',
    section_type: 'INTRO',
    label: `섹션 ${id}`,
    display_order: 0,
    is_active: active,
    page_key: 'home',
    settings: samples.map((isSample, i) => ({
      id: `${id}-${i}`,
      field_key: `key_${i}`,
      field_value: '값',
      value_type: 'STRING',
      is_sample: isSample,
    })),
    created_at: '',
    updated_at: '',
  }
}

describe('샘플 콘텐츠 헬퍼 (T-120)', () => {
  it('샘플 키만 고르고, 숨긴 섹션은 세지 않는다', () => {
    const a = makeSection('a', [true, false, true])
    const hidden = makeSection('b', [true], false)
    expect(sampleKeys(a)).toEqual(['key_0', 'key_2'])
    expect(countSampleSettings([a, hidden])).toBe(2)
  })
})

describe('ApplyConfirmDialog — 콘텐츠 모드 (T-120)', () => {
  it('샘플이 있는 템플릿은 기본 "유지"로 적용한다', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    render(
      <ApplyConfirmDialog
        template={codeTemplate}
        isApplying={false}
        onConfirm={onConfirm}
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByRole('radio', { name: /내 콘텐츠 유지/ })).toBeChecked()
    expect(screen.getByText(/새 템플릿에만 있는 섹션은 샘플 내용으로/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '적용하기' }))
    expect(onConfirm).toHaveBeenCalledWith('keep')
  })

  it('"샘플로 교체"를 고르면 경고와 함께 replace_with_sample 로 적용한다', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    render(
      <ApplyConfirmDialog
        template={codeTemplate}
        isApplying={false}
        onConfirm={onConfirm}
        onClose={vi.fn()}
      />,
    )
    await user.click(screen.getByRole('radio', { name: /템플릿 샘플로 교체/ }))
    expect(screen.getByRole('alert')).toHaveTextContent('템플릿 샘플로 바뀝니다')
    await user.click(screen.getByRole('button', { name: '샘플로 교체하기' }))
    expect(onConfirm).toHaveBeenCalledWith('replace_with_sample')
  })

  it('샘플이 없는 템플릿은 선택지를 보여주지 않는다', () => {
    render(
      <ApplyConfirmDialog
        template={{ ...codeTemplate, has_sample_content: false, renderer: 'theme' }}
        isApplying={false}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
    expect(screen.queryByText(/샘플 내용으로 추가/)).not.toBeInTheDocument()
  })
})

describe('섹션 목록 샘플 배지 (T-120)', () => {
  const renderItem = (section: Section) =>
    render(
      <MemoryRouter>
        <DndContext>
          <SortableContext items={[section.id]}>
            <ul>
              <SectionListItem section={section} onToggle={vi.fn()} isToggling={false} />
            </ul>
          </SortableContext>
        </DndContext>
      </MemoryRouter>,
    )

  it('샘플 값이 남은 섹션에 개수를 표시한다', () => {
    renderItem(makeSection('a', [true, true, false]))
    expect(screen.getByText('샘플 2')).toBeInTheDocument()
  })

  it('휴대폰에서 숨긴 섹션에 표시를 붙인다 (T-037-D)', () => {
    const section = makeSection('m', [false])
    section.settings.push({
      ...section.settings[0],
      id: 'm-mobile',
      field_key: 'mobile_hidden',
      field_value: 'true',
      value_type: 'BOOLEAN',
    })
    renderItem(section)
    expect(screen.getByText('📱 휴대폰 숨김')).toBeInTheDocument()
  })

  it('샘플이 없으면 배지를 표시하지 않는다', () => {
    renderItem(makeSection('a', [false]))
    expect(screen.queryByText(/샘플 \d/)).not.toBeInTheDocument()
  })
})

describe('대시보드 샘플 안내 (T-120)', () => {
  // 개수는 대시보드 통계 sample_count 로 받는다 (T-043-A)
  const renderReminder = (count: number) =>
    render(
      <MemoryRouter>
        <SampleReminder count={count} />
      </MemoryRouter>,
    )

  it('샘플이 남아 있으면 개수와 콘텐츠 링크를 보여준다', () => {
    renderReminder(3)
    expect(screen.getByText('샘플 3개 남음')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '콘텐츠 바꾸러 가기' })).toHaveAttribute(
      'href',
      '/admin/content',
    )
  })

  it('샘플이 없으면 아무것도 그리지 않는다', () => {
    const { container } = renderReminder(0)
    expect(container).toBeEmptyDOMElement()
  })
})
