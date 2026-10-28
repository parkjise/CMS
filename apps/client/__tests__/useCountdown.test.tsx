import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { formatSeconds, useCountdown } from '@/hooks/useCountdown'

// 카운트다운 — 끝나는 시각 기준 (T-114-A)

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('useCountdown', () => {
  it('start(n) 후 시간이 지나면 줄고, 0 에서 멈춘다', async () => {
    const { result } = renderHook(() => useCountdown())
    expect(result.current.active).toBe(false)
    act(() => result.current.start(60))
    expect(result.current.remaining).toBe(60)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000)
    })
    expect(result.current.remaining).toBe(50)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000)
    })
    expect(result.current.remaining).toBe(0)
    expect(result.current.active).toBe(false)
  })

  it('백그라운드 탭처럼 타이머가 멈춰 있다 돌아와도 실제 지난 시간만큼 줄어 있다', async () => {
    const { result } = renderHook(() => useCountdown())
    act(() => result.current.start(180))
    // 타이머는 안 돌고 시계만 2분 흐름 (브라우저가 백그라운드 탭 타이머를 늦춘 상황)
    vi.setSystemTime(Date.now() + 120_000)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250)
    })
    expect(result.current.remaining).toBe(60)
  })

  it('다시 start 하면 새로 시작, 0 이면 멈춤', async () => {
    const { result } = renderHook(() => useCountdown(30))
    expect(result.current.remaining).toBe(30)
    act(() => result.current.start(90))
    expect(result.current.remaining).toBe(90)
    act(() => result.current.start(0))
    expect(result.current.active).toBe(false)
  })

  it('formatSeconds', () => {
    expect(formatSeconds(180)).toBe('3:00')
    expect(formatSeconds(65)).toBe('1:05')
  })
})
