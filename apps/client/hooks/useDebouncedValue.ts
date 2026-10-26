'use client'

import { useEffect, useState } from 'react'

/** 입력이 멈춘 뒤 delay(ms) 후 값 — 이메일 중복 확인 1초 디바운스 (기획서 16.3) */
export const useDebouncedValue = <T,>(value: T, delay: number): T => {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay)
    return () => window.clearTimeout(timer)
  }, [value, delay])
  return debounced
}
