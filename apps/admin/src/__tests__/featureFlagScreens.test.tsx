import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DndContext } from '@dnd-kit/core'
import { SortableContext } from '@dnd-kit/sortable'
import { MemoryRouter } from 'react-router'
import { SectionListItem } from '@/components/content/SectionListItem'
import type { Section } from '@/hooks/useSections'
import { useFeatureStore } from '@/stores/featureStore'

// 관리자 — 꺼진 기능의 조작을 보여 주지 않는다 (T-138)
const section = {
  id: 's1',
  section_type: 'INTRO',
  label: '소개',
  is_active: true,
  settings: [],
} as unknown as Section

const renderItem = () =>
  render(
    <MemoryRouter>
      <DndContext>
        <SortableContext items={['s1']}>
          <SectionListItem section={section} onToggle={vi.fn()} isToggling={false} />
        </SortableContext>
      </DndContext>
    </MemoryRouter>,
  )

const HANDLE = '소개 순서 변경'

describe('섹션 순서 변경 플래그', () => {
  afterEach(() => useFeatureStore.setState({ loaded: false, flags: {} }))

  it('꺼짐 — 드래그 손잡이 없음', () => {
    useFeatureStore.setState({ loaded: true, flags: { DRAG_SECTION_ORDER: false } })
    renderItem()
    expect(screen.queryByRole('button', { name: HANDLE })).toBeNull()
  })

  it('켜짐 — 손잡이 있음', () => {
    useFeatureStore.setState({ loaded: true, flags: { DRAG_SECTION_ORDER: true } })
    renderItem()
    expect(screen.getByRole('button', { name: HANDLE })).toBeInTheDocument()
  })

  it('불러오기 전 — 막지 않는다 (서버가 다시 확인)', () => {
    useFeatureStore.setState({ loaded: false, flags: {} })
    renderItem()
    expect(screen.getByRole('button', { name: HANDLE })).toBeInTheDocument()
  })
})
