/**
 * POST 기반 SSE(text/event-stream) 소비 유틸.
 * EventSource는 GET만 지원하므로 fetch + ReadableStream으로 직접 파싱한다.
 */

const BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8000/api'

export interface AiAction {
  action: 'update_text' | 'update_theme' | 'change_template' | 'explain'
  section_id?: string
  field?: string
  new_value?: string
  css_overrides?: Record<string, string>
  template_id?: string
}

export interface ChatHistoryItem {
  role: 'user' | 'assistant'
  content: string
}

export interface ChatStreamHandlers {
  onDelta: (content: string) => void
  onActions: (actions: AiAction[]) => void
  onDone: () => void
  onError: (status?: number) => void
}

/** 하나의 SSE 청크(\n\n 분리 전)에서 data 페이로드 문자열을 추출. 주석/keepalive는 무시. */
export function extractSseData(rawEvent: string): string | null {
  const data = rawEvent
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trim())
    .join('')
  return data || null
}

function dispatch(payload: unknown, handlers: ChatStreamHandlers): void {
  if (typeof payload !== 'object' || payload === null) return
  const evt = payload as { type?: string; content?: string; actions?: AiAction[] }
  switch (evt.type) {
    case 'delta':
      if (typeof evt.content === 'string') handlers.onDelta(evt.content)
      break
    case 'actions':
      handlers.onActions(Array.isArray(evt.actions) ? evt.actions : [])
      break
    case 'done':
      handlers.onDone()
      break
    case 'error':
      handlers.onError()
      break
  }
}

export async function streamChatEdit(
  body: { message: string; conversation_history: ChatHistoryItem[] },
  handlers: ChatStreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  let res: Response
  try {
    res = await fetch(`${BASE_URL}/v1/ai/chat-edit`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    })
  } catch {
    handlers.onError()
    return
  }

  if (!res.ok) {
    handlers.onError(res.status)
    return
  }
  if (!res.body) {
    handlers.onError()
    return
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      let sepIndex: number
      while ((sepIndex = buffer.indexOf('\n\n')) !== -1) {
        const rawEvent = buffer.slice(0, sepIndex)
        buffer = buffer.slice(sepIndex + 2)
        const data = extractSseData(rawEvent)
        if (!data) continue
        try {
          dispatch(JSON.parse(data), handlers)
        } catch {
          // 파싱 불가한 이벤트는 건너뛴다
        }
      }
    }
  } catch {
    handlers.onError()
  }
}
