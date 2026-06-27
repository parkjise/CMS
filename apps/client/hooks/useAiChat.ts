'use client'

import { useCallback, useRef, useState } from 'react'
import { type AiAction, streamChatEdit } from '@/lib/aiChatStream'

export interface ChatPanelMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  actions: AiAction[]
  streaming: boolean
}

interface UseAiChat {
  messages: ChatPanelMessage[]
  isStreaming: boolean
  error: string | null
  send: (text: string) => Promise<void>
}

let _seq = 0
const nextId = () => `m${++_seq}-${Date.now()}`

function errorMessage(status?: number): string {
  if (status === 403) {
    return '대화형 편집은 STANDARD 이상 플랜에서 사용할 수 있습니다.'
  }
  if (status === 422) {
    return '이번 달 대화형 편집 사용 한도를 초과했습니다.'
  }
  return 'AI 응답 중 오류가 발생했습니다. 다시 시도해주세요.'
}

export function useAiChat(): UseAiChat {
  const [messages, setMessages] = useState<ChatPanelMessage[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const streamingRef = useRef(false)

  const patch = useCallback(
    (id: string, updater: (m: ChatPanelMessage) => ChatPanelMessage) => {
      setMessages((prev) => prev.map((m) => (m.id === id ? updater(m) : m)))
    },
    [],
  )

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim()
      if (!trimmed || streamingRef.current) return

      const history = messages.map((m) => ({
        role: m.role,
        content: m.content,
      }))
      const assistantId = nextId()

      setMessages((prev) => [
        ...prev,
        { id: nextId(), role: 'user', content: trimmed, actions: [], streaming: false },
        { id: assistantId, role: 'assistant', content: '', actions: [], streaming: true },
      ])
      setError(null)
      setIsStreaming(true)
      streamingRef.current = true

      const finish = () => {
        patch(assistantId, (m) => ({ ...m, streaming: false }))
        setIsStreaming(false)
        streamingRef.current = false
      }

      await streamChatEdit(
        { message: trimmed, conversation_history: history },
        {
          onDelta: (content) =>
            patch(assistantId, (m) => ({ ...m, content: m.content + content })),
          onActions: (actions) =>
            patch(assistantId, (m) => ({ ...m, actions })),
          onDone: finish,
          onError: (status) => {
            setError(errorMessage(status))
            finish()
          },
        },
      )
    },
    [messages, patch],
  )

  return { messages, isStreaming, error, send }
}
