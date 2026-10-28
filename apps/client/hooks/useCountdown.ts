'use client'

import { useCallback, useEffect, useState } from 'react'

const TICK_MS = 250

const secondsLeft = (deadline: number) => Math.max(0, Math.ceil((deadline - Date.now()) / 1000))

/**
 * 남은 초 카운트다운 — start(n) 으로 시작, 0 이 되면 멈춤 (인증 3분 · 재발송 60초 · 잠금)
 *
 * 끝나는 시각(deadline)을 기준으로 센다 (T-114-A). 예전처럼 1초마다 다음 타이머를 거는 방식은
 * 브라우저가 백그라운드 탭의 타이머를 늦추면 실제 시간보다 늦게 줄어들었다.
 */
export const useCountdown = (initial = 0) => {
  const [deadline, setDeadline] = useState<number | null>(() =>
    initial > 0 ? Date.now() + initial * 1000 : null,
  )
  const [remaining, setRemaining] = useState(Math.max(0, initial))

  useEffect(() => {
    if (deadline === null) return
    const update = () => {
      const left = secondsLeft(deadline)
      setRemaining(left)
      if (left <= 0) setDeadline(null)
    }
    update()
    const timer = window.setInterval(update, TICK_MS)
    return () => window.clearInterval(timer)
  }, [deadline])

  const start = useCallback((seconds: number) => {
    const s = Math.max(0, seconds)
    setRemaining(s)
    setDeadline(s > 0 ? Date.now() + s * 1000 : null)
  }, [])
  return { remaining, start, active: remaining > 0 }
}

/** 초 → "m:ss" */
export const formatSeconds = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
