'use client'

import { useCallback, useEffect, useState } from 'react'

/** 남은 초 카운트다운 — start(n) 으로 시작, 0 이 되면 멈춤 (인증 3분 · 재발송 60초 · 잠금) */
export const useCountdown = (initial = 0) => {
  const [remaining, setRemaining] = useState(initial)

  useEffect(() => {
    if (remaining <= 0) return
    const timer = window.setTimeout(() => setRemaining((s) => s - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [remaining])

  const start = useCallback((seconds: number) => setRemaining(Math.max(0, seconds)), [])
  return { remaining, start, active: remaining > 0 }
}

/** 초 → "m:ss" */
export const formatSeconds = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
