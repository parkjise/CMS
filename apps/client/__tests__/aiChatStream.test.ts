import { afterEach, describe, expect, it, vi } from 'vitest'
import { extractSseData, streamChatEdit } from '@/lib/aiChatStream'

describe('extractSseData', () => {
  it('data 라인을 추출한다', () => {
    expect(extractSseData('data: {"type":"delta"}')).toBe('{"type":"delta"}')
  })

  it('주석/keepalive는 null', () => {
    expect(extractSseData(': keepalive')).toBeNull()
  })
})

function streamResponse(
  chunks: string[],
  { ok = true, status = 200 }: { ok?: boolean; status?: number } = {},
): Response {
  const encoder = new TextEncoder()
  let i = 0
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i < chunks.length) {
        controller.enqueue(encoder.encode(chunks[i++]))
      } else {
        controller.close()
      }
    },
  })
  return { ok, status, body } as unknown as Response
}

const makeHandlers = () => ({
  onDelta: vi.fn(),
  onActions: vi.fn(),
  onDone: vi.fn(),
  onError: vi.fn(),
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('streamChatEdit', () => {
  it('delta → actions → done 이벤트를 순서대로 디스패치한다', async () => {
    const chunks = [
      'data: {"type":"delta","content":"안녕"}\n\n',
      'data: {"type":"delta","content":"하세요"}\n\n',
      'data: {"type":"actions","actions":[{"action":"update_text","new_value":"X"}]}\n\n',
      'data: {"type":"done"}\n\n',
    ]
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(streamResponse(chunks)))
    const handlers = makeHandlers()

    await streamChatEdit(
      { message: '안녕', conversation_history: [] },
      handlers,
    )

    expect(handlers.onDelta).toHaveBeenNthCalledWith(1, '안녕')
    expect(handlers.onDelta).toHaveBeenNthCalledWith(2, '하세요')
    expect(handlers.onActions).toHaveBeenCalledWith([
      { action: 'update_text', new_value: 'X' },
    ])
    expect(handlers.onDone).toHaveBeenCalledTimes(1)
    expect(handlers.onError).not.toHaveBeenCalled()
  })

  it('이벤트가 청크 경계에 걸쳐도 올바르게 파싱한다', async () => {
    const chunks = ['data: {"type":"del', 'ta","content":"안녕"}\n\n']
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(streamResponse(chunks)))
    const handlers = makeHandlers()

    await streamChatEdit({ message: 'x', conversation_history: [] }, handlers)

    expect(handlers.onDelta).toHaveBeenCalledWith('안녕')
  })

  it('keepalive 주석은 무시한다', async () => {
    const chunks = [': keepalive\n\n', 'data: {"type":"done"}\n\n']
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(streamResponse(chunks)))
    const handlers = makeHandlers()

    await streamChatEdit({ message: 'x', conversation_history: [] }, handlers)

    expect(handlers.onDelta).not.toHaveBeenCalled()
    expect(handlers.onDone).toHaveBeenCalled()
  })

  it('non-OK 응답이면 상태코드로 onError를 호출한다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(streamResponse([], { ok: false, status: 403 })),
    )
    const handlers = makeHandlers()

    await streamChatEdit({ message: 'x', conversation_history: [] }, handlers)

    expect(handlers.onError).toHaveBeenCalledWith(403)
    expect(handlers.onDone).not.toHaveBeenCalled()
  })

  it('fetch 예외 시 onError를 호출한다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')))
    const handlers = makeHandlers()

    await streamChatEdit({ message: 'x', conversation_history: [] }, handlers)

    expect(handlers.onError).toHaveBeenCalled()
  })
})
