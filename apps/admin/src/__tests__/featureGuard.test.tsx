import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { FeatureGuard } from '@/components/layout/FeatureGuard'
import { useFeatureStore } from '@/stores/featureStore'

function renderGuard(feature: string) {
  return render(
    <MemoryRouter>
      <FeatureGuard feature={feature}>
        <div>보호된 페이지</div>
      </FeatureGuard>
    </MemoryRouter>,
  )
}

describe('FeatureGuard', () => {
  beforeEach(() => useFeatureStore.getState().reset())
  afterEach(() => useFeatureStore.getState().reset())

  it('loaded 전에는 children을 통과시킨다', () => {
    renderGuard('SECTION_EDITOR')
    expect(screen.getByText('보호된 페이지')).toBeInTheDocument()
  })

  it('loaded 후 기능이 켜져 있으면 children 노출', () => {
    useFeatureStore.setState({ loaded: true, flags: { SECTION_EDITOR: true } })
    renderGuard('SECTION_EDITOR')
    expect(screen.getByText('보호된 페이지')).toBeInTheDocument()
  })

  it('loaded 후 기능이 꺼져 있으면 안내 페이지 노출', () => {
    useFeatureStore.setState({ loaded: true, flags: { SECTION_EDITOR: false } })
    renderGuard('SECTION_EDITOR')
    expect(screen.getByText('현재 비활성화된 기능입니다')).toBeInTheDocument()
    expect(screen.queryByText('보호된 페이지')).not.toBeInTheDocument()
  })
})
