import { Link } from 'react-router'
import { Clock } from 'lucide-react'
import { useTrialStatus } from '@/hooks/useTrialStatus'

export function TrialBanner() {
  const { data } = useTrialStatus()

  if (!data?.is_trial) return null

  const urgent = data.days_left <= 3
  const tone = urgent
    ? 'bg-red-50 text-red-800 border-red-200'
    : 'bg-indigo-50 text-indigo-800 border-indigo-200'

  return (
    <div
      role="status"
      className={`flex items-center gap-2 border-b px-4 py-2 text-sm ${tone}`}
    >
      <Clock size={16} aria-hidden="true" className="shrink-0" />
      <span className="min-w-0 flex-1">
        무료 체험 <b>D-{data.days_left}</b> · 체험 종료 후에도 이용하려면 결제 수단을
        등록해 주세요.
      </span>
      <Link
        to="/admin/billing"
        className="shrink-0 rounded-md bg-white/70 px-2 py-1 text-xs font-medium hover:bg-white"
      >
        결제 등록
      </Link>
    </div>
  )
}
