import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { LeaveGuard } from '@/components/site/LeaveGuard'
import { useAuthStore } from '@/stores/authStore'

const Where = () => <p>이동한 화면</p>

const renderGuard = (props: Partial<React.ComponentProps<typeof LeaveGuard>> = {}) => {
  const router = createMemoryRouter(
    [
      { path: '/admin/site/info', element: <LeaveGuard dirty {...props} /> },
      { path: '*', element: <Where /> },
    ],
    { initialEntries: ['/admin/site/info'] }
  )
  render(<RouterProvider router={router} />)
  return router
}

const leave = async (router: ReturnType<typeof renderGuard>) => {
  await act(() => router.navigate('/admin/boards'))
  return screen.findByRole('dialog')
}

beforeEach(() => {
  useAuthStore.setState({ user: { role: 'TENANT_ADMIN' } } as never)
})

describe('나가기 확인 창 (T-227)', () => {
  it('[계속 편집] · Escape 는 화면에 남는다', async () => {
    const router = renderGuard()
    await leave(router)
    await userEvent.click(screen.getByRole('button', { name: '계속 편집' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/admin/site/info')

    await leave(router)
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/admin/site/info')
  })

  it('[저장하지 않고 이동] 은 저장하지 않고 간다', async () => {
    const onSave = vi.fn()
    const router = renderGuard({ onSave })
    await leave(router)
    await userEvent.click(screen.getByRole('button', { name: '저장하지 않고 이동' }))
    expect(await screen.findByText('이동한 화면')).toBeInTheDocument()
    expect(onSave).not.toHaveBeenCalled()
  })

  it('[저장하고 이동] 은 저장에 성공하면 간다', async () => {
    const onSave = vi.fn().mockResolvedValue(true)
    const router = renderGuard({ onSave })
    await leave(router)
    await userEvent.click(screen.getByRole('button', { name: '저장하고 이동' }))
    expect(await screen.findByText('이동한 화면')).toBeInTheDocument()
    expect(onSave).toHaveBeenCalledOnce()
  })

  it('저장에 실패하면 창을 닫고 화면에 남는다', async () => {
    const onSave = vi.fn().mockResolvedValue(false)
    const router = renderGuard({ onSave })
    await leave(router)
    await userEvent.click(screen.getByRole('button', { name: '저장하고 이동' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(router.state.location.pathname).toBe('/admin/site/info')
  })

  it('저장을 막는 값이 있으면 까닭을 보여 주고 [저장하고 이동] 을 끈다', async () => {
    const router = renderGuard({ onSave: vi.fn(), saveBlockedReason: '글자 수 제한을 넘었어요.' })
    await leave(router)
    expect(screen.getByRole('alert')).toHaveTextContent('글자 수 제한을 넘었어요.')
    expect(screen.getByRole('button', { name: '저장하고 이동' })).toBeDisabled()
  })

  it('저장 기능이 없거나 보기 전용이면 [저장하고 이동] 이 없다', async () => {
    const router = renderGuard({ message: '그만두고 나갈까요?' })
    await leave(router)
    expect(screen.getByText('그만두고 나갈까요?')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '저장하고 이동' })).not.toBeInTheDocument()
  })

  it('보기 전용 계정에는 [저장하고 이동] 이 없다', async () => {
    useAuthStore.setState({ user: { role: 'TENANT_VIEWER' } } as never)
    const router = renderGuard({ onSave: vi.fn() })
    await leave(router)
    expect(screen.queryByRole('button', { name: '저장하고 이동' })).not.toBeInTheDocument()
  })

  it('바꾼 것이 없으면 묻지 않는다', async () => {
    const router = createMemoryRouter(
      [
        { path: '/admin/site/info', element: <LeaveGuard dirty={false} /> },
        { path: '*', element: <Where /> },
      ],
      { initialEntries: ['/admin/site/info'] }
    )
    render(<RouterProvider router={router} />)
    await act(() => router.navigate('/admin/boards'))
    expect(await screen.findByText('이동한 화면')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
