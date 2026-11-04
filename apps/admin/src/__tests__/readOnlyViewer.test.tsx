import { afterEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { User } from '@cms/types'
import { ReadOnlyBanner } from '@/components/layout/ReadOnlyBanner'
import { ReadOnlyFieldset } from '@/components/layout/ReadOnlyFieldset'
import { useAuthStore } from '@/stores/authStore'

// 보기 전용 계정 화면 (T-130) — 실제 쓰기 차단은 서버가 한다
const setRole = (role: User['role'] | null) =>
  useAuthStore.setState({ user: role ? ({ role } as User) : null })

const Form = () => (
  <ReadOnlyFieldset>
    <input aria-label="이름" />
    <button type="button">저장</button>
    <a href="/admin/content">섹션 보기</a>
  </ReadOnlyFieldset>
)

describe('보기 전용 계정', () => {
  afterEach(() => setRole(null))

  it('뷰어 — 안내가 나오고 입력칸 · 버튼이 잠기며 링크는 그대로', () => {
    setRole('TENANT_VIEWER')
    render(
      <>
        <ReadOnlyBanner />
        <Form />
      </>,
    )
    expect(screen.getByRole('status')).toHaveTextContent('보기 전용 계정')
    expect(screen.getByLabelText('이름')).toBeDisabled()
    expect(screen.getByRole('button', { name: '저장' })).toBeDisabled()
    expect(screen.getByRole('link', { name: '섹션 보기' })).toBeInTheDocument()
  })

  it('관리자 — 안내 없음, 잠기지 않음', () => {
    setRole('TENANT_ADMIN')
    render(
      <>
        <ReadOnlyBanner />
        <Form />
      </>,
    )
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.getByLabelText('이름')).toBeEnabled()
    expect(screen.getByRole('button', { name: '저장' })).toBeEnabled()
  })
})
