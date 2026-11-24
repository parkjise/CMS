import { useEffect, useState } from 'react'
import { usePageKeyCheck } from '@/hooks/usePages'
import { pageKeyError } from '@/lib/pageKey'

/** 입력 중 주소 확인 결과 — 만들기 · 저장 버튼을 막을 때도 쓴다 */
export function usePageKeyProblem(value: string, current?: string): string | undefined {
  // 입력을 멈추면 서버에 미리 확인 (게시판 주소와 같은 방식, T-210)
  const [checked, setChecked] = useState('')
  useEffect(() => {
    const timer = window.setTimeout(() => setChecked(value), 400)
    return () => window.clearTimeout(timer)
  }, [value])
  const unchanged = value === current
  const formatError = value && !unchanged ? pageKeyError(value) : undefined
  const ask = !formatError && !unchanged && checked === value ? value : ''
  const check = usePageKeyCheck(ask)
  if (formatError) return formatError
  if (ask && check.data?.available === false) return check.data.reason ?? undefined
  return undefined
}
