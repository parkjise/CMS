import { formatSeconds } from '@/hooks/useCountdown'

/** 로그인 잠금 안내 + 남은 시간 (기획서 16.4 — 5회 실패 30분) */
const LockNotice = ({ remaining }: { remaining: number }) => (
  <p role="alert" className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
    30분 후에 다시 시도해주세요{' '}
    <span className="font-semibold" aria-label="남은 잠금 시간">
      ({formatSeconds(remaining)})
    </span>
  </p>
)

export default LockNotice
