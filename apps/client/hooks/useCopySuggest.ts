'use client'

import { useCallback, useState } from 'react'
import { authApi } from '@/lib/api'

export interface CopySuggestParams {
  section_type: string
  field: string
  current_value: string
  tone?: string
  count?: number
}

interface CopySuggestData {
  suggestions: string[]
  tokens_used: number
  usage: { used: number; limit: number | null; remaining: number | null }
  prompt_version: string
}

interface UseCopySuggest {
  suggestions: string[]
  isLoading: boolean
  error: string | null
  generate: (params: CopySuggestParams) => Promise<void>
  reset: () => void
}

/**
 * AI 문구 추천 API(POST /ai/suggest-copy) 호출 훅.
 * 클라이언트 앱의 기존 패턴(authApi 직접 호출)에 맞춰 명령형으로 동작한다.
 */
export function useCopySuggest(): UseCopySuggest {
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const generate = useCallback(async (params: CopySuggestParams) => {
    setIsLoading(true)
    setError(null)
    try {
      const { data } = await authApi.post('/ai/suggest-copy', {
        tone: 'professional',
        count: 3,
        ...params,
      })
      const result = data.data as CopySuggestData
      setSuggestions(result.suggestions)
    } catch (err: unknown) {
      const status =
        typeof err === 'object' && err !== null && 'response' in err
          ? (err as { response?: { status?: number } }).response?.status
          : undefined
      setError(
        status === 422
          ? '이번 달 AI 추천 사용 한도를 초과했습니다.'
          : '추천 문구를 불러오지 못했습니다. 다시 시도해주세요.',
      )
      setSuggestions([])
    } finally {
      setIsLoading(false)
    }
  }, [])

  const reset = useCallback(() => {
    setSuggestions([])
    setError(null)
    setIsLoading(false)
  }, [])

  return { suggestions, isLoading, error, generate, reset }
}
