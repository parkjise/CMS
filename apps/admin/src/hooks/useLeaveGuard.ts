import { useEffect } from 'react'
import { useBlocker } from 'react-router'

const LEAVE_MESSAGE = '저장하지 않은 변경사항이 있습니다. 저장하지 않고 이동할까요?'

/** 저장 안 한 채 다른 화면 · 창 닫기를 막는다 (T-221) — 데이터 라우터 안에서만 */
export function useLeaveGuard(dirty: boolean) {
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty && currentLocation.pathname !== nextLocation.pathname
  )
  useEffect(() => {
    if (blocker.state !== 'blocked') return
    if (window.confirm(LEAVE_MESSAGE)) blocker.proceed()
    else blocker.reset()
  }, [blocker])
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])
}
