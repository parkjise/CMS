import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, render, waitFor } from '@testing-library/react'
import DeferredStylesheets from '@/templates/shared/DeferredStylesheets'

const URL = 'https://fonts.example.com/late.css'
afterEach(() => {
  vi.unstubAllGlobals()
  document.head.innerHTML = ''
})

describe('지연 글꼴 CSS 요청 정리', () => {
  it.each(['resolve', 'reject'])(
    '해제 후 fetch가 %s해도 스타일/대체 링크를 붙이지 않는다',
    async (result) => {
      let resolve!: (value: Response) => void
      let reject!: (reason: Error) => void
      const pending = new Promise<Response>((done, fail) => {
        resolve = done
        reject = fail
      })
      const fetchMock = vi.fn(() => pending)
      vi.stubGlobal('fetch', fetchMock)
      const view = render(<DeferredStylesheets hrefs={[URL]} swapFontDisplay={[URL]} />)
      const signal = vi.mocked(fetch).mock.calls[0][1]?.signal
      view.unmount()
      expect(signal?.aborted).toBe(true)
      await act(async () => {
        if (result === 'resolve') resolve(new Response('body{color:red}'))
        else reject(new TypeError('late failure'))
        await pending.catch(() => undefined)
      })
      expect(document.head.querySelector('style[data-href], link[rel="stylesheet"]')).toBeNull()
    }
  )

  it('fetch 가 응답 없이(undefined) 끝나도 오류 없이 일반 링크로 붙인다 (T-175)', async () => {
    // 다른 시험이 fetch 를 응답 없이 흉내 내면 res.ok 에서 터져 시험 환경이 정리된 뒤 실패했다
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(undefined))
    render(<DeferredStylesheets hrefs={[URL]} swapFontDisplay={[URL]} />)
    await waitFor(() =>
      expect(document.head.querySelector(`link[rel="stylesheet"][href="${URL}"]`)).not.toBeNull(),
    )
  })

  it('화면(document)이 사라진 뒤 끝난 요청은 아무것도 붙이지 않는다 (T-175)', async () => {
    let finish!: (value: Response) => void
    const pending = new Promise<Response>((resolve) => {
      finish = resolve
    })
    vi.stubGlobal('fetch', vi.fn(() => pending))
    render(<DeferredStylesheets hrefs={[URL]} swapFontDisplay={[URL]} />)
    vi.stubGlobal('document', undefined)
    await act(async () => {
      finish(new Response('body{color:red}'))
      await pending
      await Promise.resolve()
    })
    vi.unstubAllGlobals()
    expect(document.head.querySelector('style[data-href], link[rel="stylesheet"]')).toBeNull()
  })

  it('응답 본문을 기다리다 해제해도 늦은 CSS를 적용하지 않는다', async () => {
    let finish!: (css: string) => void
    const body = new Promise<string>((resolve) => {
      finish = resolve
    })
    const text = vi.fn(() => body)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text }))
    const view = render(<DeferredStylesheets hrefs={[URL]} swapFontDisplay={[URL]} />)
    await waitFor(() => expect(text).toHaveBeenCalled())
    view.unmount()
    await act(async () => {
      finish('body{color:red}')
      await body
    })
    expect(document.head.querySelector('style[data-href], link[rel="stylesheet"]')).toBeNull()
  })

  it('주소가 바뀌면 이전 요청은 취소하고 새 요청의 swap CSS만 적용한다', async () => {
    let finishOld!: (value: Response) => void
    const old = new Promise<Response>((resolve) => {
      finishOld = resolve
    })
    const fetchMock = vi
      .fn()
      .mockReturnValueOnce(old)
      .mockResolvedValueOnce(new Response('@font-face{font-display:block}'))
    vi.stubGlobal('fetch', fetchMock)
    const view = render(<DeferredStylesheets hrefs={[URL]} swapFontDisplay={[URL]} />)
    const oldSignal = vi.mocked(fetch).mock.calls[0][1]?.signal
    const next = 'https://fonts.example.com/current.css'
    view.rerender(<DeferredStylesheets hrefs={[next]} swapFontDisplay={[next]} />)
    expect(oldSignal?.aborted).toBe(true)
    await waitFor(() =>
      expect(document.head.querySelector(`style[data-href="${next}"]`)).toHaveTextContent(
        'font-display:swap'
      )
    )
    await act(async () => {
      finishOld(new Response('body{color:red}'))
      await old
    })
    expect(document.head.querySelector(`style[data-href="${URL}"]`)).toBeNull()
    expect(document.head.querySelector(`link[href="${URL}"]`)).toBeNull()
  })
})
