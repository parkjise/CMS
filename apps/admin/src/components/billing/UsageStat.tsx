import type { LucideIcon } from 'lucide-react'

interface UsageStatProps {
  icon: LucideIcon
  iconBg: string
  label: string
  value: string | number
  hint?: string
  /** 진행률 0~100. null = 진행률 미표시 */
  progress?: number | null
  isLoading?: boolean
  pending?: boolean
}

export function UsageStat({
  icon: Icon,
  iconBg,
  label,
  value,
  hint,
  progress,
  isLoading,
  pending,
}: UsageStatProps) {
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
        <div className="h-7 w-20 animate-pulse rounded bg-slate-200" />
      ) : (
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold text-slate-900">
            {typeof value === 'number' ? value.toLocaleString() : value}
          </span>
          {pending && (
            <span className="text-xs text-amber-600">곧 제공</span>
          )}
        </div>
      )}

      {hint && !isLoading && (
        <p className="mt-1 text-xs text-slate-500">{hint}</p>
      )}

      {typeof progress === 'number' && !isLoading && (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
          <div
            className={`h-full transition-all ${
              progress >= 90
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
