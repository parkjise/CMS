'use client'

import { useEffect, useState } from 'react'

/**
 * 템플릿을 바꾼 직후 잠깐 보이는 안내 화면 (T-037-F).
 *
 * 미들웨어는 테넌트 템플릿을 몇 초 동안 기억하므로(middleware.ts CACHE_TTL_MS),
 * 바꾼 직후에는 이전 템플릿 라우트로 들어올 수 있다. 예전엔 여기서 404 · 깨진 화면이 나왔다.
 * 이제 안내를 보여 주고 1초 뒤 다시 불러온다 — 기억이 풀리면 새 템플릿 화면이 뜬다.
 * 같은 주소에서 MAX_RELOADS 번 넘게 다시 불러와도 그대로면 멈추고 새로고침 버튼만 둔다.
 */
export const RELOAD_DELAY_MS = 1_000
export const MAX_RELOADS = 5
// 이보다 오래된 기록은 새 전환으로 보고 횟수를 다시 센다
const RESET_AFTER_MS = 30_000
const STORAGE_PREFIX = 'tpl-switching:'

interface ReloadRecord {
  n: number
  t: number
}

/** 이번에 다시 불러와도 되는지 — 횟수를 하나 올린다. 저장소를 못 쓰면 다시 불러오지 않는다 */
export function claimReload(path: string, now = Date.now()): boolean {
  try {
    const key = STORAGE_PREFIX + path
    const prev = JSON.parse(sessionStorage.getItem(key) ?? 'null') as ReloadRecord | null
    const n = prev && now - prev.t < RESET_AFTER_MS ? prev.n : 0
    if (n >= MAX_RELOADS) return false
    sessionStorage.setItem(key, JSON.stringify({ n: n + 1, t: now }))
    return true
  } catch {
    return false
  }
}

export const TemplateSwitching = () => {
  const [waiting, setWaiting] = useState(true)

  useEffect(() => {
    if (!claimReload(window.location.pathname)) {
      setWaiting(false)
      return
    }
    const timer = window.setTimeout(() => window.location.reload(), RELOAD_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [])

  return (
    <main
      data-template-switching
      className="flex min-h-screen flex-col items-center justify-center bg-white px-6 text-center"
    >
      <h1 className="text-xl font-bold text-slate-900">홈페이지를 새로 단장하는 중이에요</h1>
      <p className="mt-2 max-w-md text-sm text-slate-500" role="status">
        {waiting ? '잠시만 기다려 주세요. 곧 새 화면으로 바뀝니다.' : '새로고침하면 새 화면을 볼 수 있어요.'}
      </p>
      {!waiting && (
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-6 rounded-md border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
        >
          새로고침
        </button>
      )}
    </main>
  )
}
