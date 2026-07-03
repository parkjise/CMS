import type { SystemStatus as SystemStatusData } from '@/hooks/useDashboard'

interface Props {
  system: SystemStatusData
}

const LABELS: { key: keyof SystemStatusData; label: string }[] = [
  { key: 'server', label: '서버' },
  { key: 'db', label: 'DB' },
  { key: 'redis', label: 'Redis' },
  { key: 'celery', label: 'Celery' },
]

export function SystemStatus({ system }: Props) {
  const allOk = LABELS.every(({ key }) => system[key])

  return (
    <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm shadow-sm">
      <span className="font-medium text-slate-500">시스템 상태</span>
      <span className={allOk ? 'text-emerald-600' : 'text-amber-600'}>
        {allOk ? '✅ 정상' : '⚠️ 점검 필요'}
      </span>
      <div className="ml-auto flex gap-3">
        {LABELS.map(({ key, label }) => (
          <span key={key} className="flex items-center gap-1 text-xs text-slate-500">
            <span
              className={`h-2 w-2 rounded-full ${
                system[key] ? 'bg-emerald-500' : 'bg-red-500'
              }`}
              aria-hidden="true"
            />
            {label}
          </span>
        ))}
      </div>
    </div>
  )
}
