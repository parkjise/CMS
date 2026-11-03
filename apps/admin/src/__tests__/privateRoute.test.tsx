import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { PrivateRoute } from '@/components/PrivateRoute'
import { useAuthStore } from '@/stores/authStore'

describe('PrivateRoute 로그인 확인 화면 (T-043-B)', () => {
  it('확인하는 동안 글자로 안내한다 — 회전 표시만 있으면 첫 화면이 늦게 잡힌다', () => {
    useAuthStore.setState({ initialized: true, isInitializing: true, isAuthenticated: false })
    render(
      <MemoryRouter>
        <PrivateRoute />
      </MemoryRouter>,
    )
    expect(screen.getByText('불러오는 중…')).toBeInTheDocument()
    useAuthStore.setState({ initialized: false, isInitializing: false })
  })
})
