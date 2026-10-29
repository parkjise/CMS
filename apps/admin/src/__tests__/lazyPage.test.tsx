import { describe, expect, it, vi } from 'vitest'
import { Suspense } from 'react'
import { act, render, screen } from '@testing-library/react'
import { lazyPage } from '@/lib/lazyPage'

// 미리 받을 수 있는 지연 로딩 페이지 (T-043-A)

const Hello = () => <p>hello-page</p>

const renderPage = (Page: ReturnType<typeof lazyPage>) =>
  render(
    <Suspense fallback={<p>loading…</p>}>
      <Page />
    </Suspense>,
  )

describe('lazyPage', () => {
  it('미리 받아 두면 대기 화면 없이 바로 그린다', async () => {
    const Page = lazyPage(async () => ({ Hello }), 'Hello')
    await Page.preload()
    renderPage(Page)
    expect(screen.getByText('hello-page')).toBeInTheDocument()
    expect(screen.queryByText('loading…')).not.toBeInTheDocument()
  })

  it('아직이면 대기 화면을 보이고 받은 뒤 그린다', async () => {
    let arrive!: () => void
    const chunk = new Promise<void>((r) => {
      arrive = r
    })
    const Page = lazyPage(async () => {
      await chunk
      return { Hello }
    }, 'Hello')
    // use() 로 멈추는 첫 렌더는 기다리는 act 안에서 (React 테스트 규칙)
    await act(async () => {
      renderPage(Page)
    })
    expect(screen.getByText('loading…')).toBeInTheDocument()
    // 코드가 도착하면 다시 그린다
    await act(async () => {
      arrive()
      await Page.preload()
    })
    expect(screen.getByText('hello-page')).toBeInTheDocument()
  })

  it('여러 번 불러도 한 번만 받는다', async () => {
    const loader = vi.fn(async () => ({ Hello }))
    const Page = lazyPage(loader, 'Hello')
    await Promise.all([Page.preload(), Page.preload()])
    renderPage(Page)
    expect(loader).toHaveBeenCalledTimes(1)
  })

  it('받기에 실패하면 다음 preload 에서 다시 시도한다', async () => {
    const loader = vi
      .fn<() => Promise<{ Hello: typeof Hello }>>()
      .mockRejectedValueOnce(new Error('chunk'))
      .mockResolvedValueOnce({ Hello })
    const Page = lazyPage(loader, 'Hello')
    await expect(Page.preload()).rejects.toThrow('chunk')
    await Page.preload()
    renderPage(Page)
    expect(screen.getByText('hello-page')).toBeInTheDocument()
    expect(loader).toHaveBeenCalledTimes(2)
  })
})
