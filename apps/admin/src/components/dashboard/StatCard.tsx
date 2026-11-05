import type { LucideIcon } from 'lucide-react'

interface StatCardProps {
  title: string
  value: number | string
  secondary?: string
  icon?: LucideIcon
  isLoading?: boolean
  accent?: 'blue' | 'emerald' | 'amber' | 'rose'
}

const accentClasses: Record<NonNullable<StatCardProps['accent']>, string> = {
  blue: 'bg-blue-50 text-blue-600',
  emerald: 'bg-emerald-50 text-emerald-600',
  amber: 'bg-amber-50 text-amber-600',
  rose: 'bg-rose-50 text-rose-600',
}

export function StatCard({
  title,
  value,
  secondary,
  icon: Icon,
  isLoading,
  accent = 'blue',
}: StatCardProps) {
  return (
    <div className={`admin-stat-card rounded-xl border p-5 stat-${accent}`}>
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-medium text-slate-500">{title}</span>
        {Icon && (
          <span
            className={`flex h-8 w-8 items-center justify-center rounded-md ${accentClasses[accent]}`}
          >
            <Icon className="h-4 w-4" />
          </span>
        )}
      </div>
      {isLoading ? (
        <div className="h-8 w-24 animate-pulse rounded bg-slate-200" />
      ) : (
        <div className="text-[28px] font-bold tracking-tight text-slate-900">
          {typeof value === 'number' ? value.toLocaleString() : value}
        </div>
      )}
      {secondary && !isLoading && (
        <p className="mt-4 border-t border-current/10 pt-3 text-xs text-slate-500">{secondary}</p>
      )}
      {secondary && isLoading && (
        <div className="mt-2 h-3 w-32 animate-pulse rounded bg-slate-100" />
      )}
    </div>
  )
}
