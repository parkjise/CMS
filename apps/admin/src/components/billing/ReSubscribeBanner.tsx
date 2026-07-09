import { Link } from 'react-router'
import { RotateCcw } from 'lucide-react'
import { useSubscription } from '@/hooks/useBilling'

export function ReSubscribeBanner() {
  const { data: sub } = useSubscription()

  // 해지 상태(현재 기간 유지 중)에서만 재구독 배너 노출
  if (!sub || sub.status !== 'CANCELLED') return null

  const periodEnd = new Date(sub.current_period_end).toLocaleDateString('ko-KR')

  return (
    <div
      role="status"
      className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800"
    >
      <RotateCcw size={16} aria-hidden="true" className="shrink-0" />
      <span className="min-w-0 flex-1">
        구독이 해지되었습니다. <b>{periodEnd}</b>까지 이용 가능하며, 이후 서비스가
        중단됩니다.
      </span>
      <Link
        to="/admin/billing"
        className="shrink-0 rounded-md bg-white/70 px-2 py-1 text-xs font-medium hover:bg-white"
      >
        재구독
      </Link>
    </div>
  )
}
