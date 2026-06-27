import type { LucideIcon } from 'lucide-react'
import type { FeatureUsage } from '@/hooks/useAiUsage'

interface AiUsageCardProps {
  icon: LucideIcon
  iconBg: string
  label: string
  usage: FeatureUsage
  isLoading?: boolean
}

function buildHint(usage: FeatureUsage): string {
  if (!usage.supported) return '현재 플랜에서는 지원하지 않습니다.'
  if (usage.limit === null) return '무제한 사용 가능'
  if (usage.exceeded) return '이번 달 한도를 모두 사용했습니다.'
  return `이번 달 ${usage.remaining}회 남음 · 한도 ${usage.limit}회`
}

/** AI 기능의 이번 달 사용 현황 카드 (예: 문구 추천 3회 / 20회) */
export function AiUsageCard({
  icon: Icon,
  iconBg,
  label,
  usage,
  isLoading,
}: AiUsageCardProps) {
  const progress =
    usage.supported && usage.limit && usage.limit > 0
      ? Math.round((usage.used / usage.limit) * 100)
      : null

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-medium text-slate-500">{label}</span>
        <span
          className={`flex h-8 w-8 items-center justify-center rounded-md ${iconBg}`}
        >
          <Icon className="h-4 w-4" />
        </span>
      </div>

      {isLoading ? (
        <div className="h-7 w-24 animate-pulse rounded bg-slate-200" />
      ) : (
        <div className="flex items-baseline gap-1.5">
          {usage.supported ? (
            <>
              <span className="text-2xl font-bold text-slate-900">
                {usage.used.toLocaleString()}
              </span>
              <span className="text-sm text-slate-400">
                / {usage.limit === null ? '무제한' : `${usage.limit}회`}
              </span>
            </>
          ) : (
            <span className="text-2xl font-bold text-slate-400">미지원</span>
          )}
          {usage.exceeded && usage.supported && (
            <span className="ml-1 rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-600">
              한도 초과
            </span>
          )}
        </div>
      )}

      {!isLoading && (
        <p className="mt-1 text-xs text-slate-500">{buildHint(usage)}</p>
      )}

      {typeof progress === 'number' && !isLoading && (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
          <div
            className={`h-full transition-all ${
              progress >= 100
                ? 'bg-rose-500'
                : progress >= 70
                  ? 'bg-amber-500'
                  : 'bg-blue-500'
            }`}
            style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
          />
        </div>
      )}
    </div>
  )
}
