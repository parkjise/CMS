import { Link } from 'react-router'
import type { ExpiringTenant } from '@/hooks/useDashboard'

interface Props {
  tenants: ExpiringTenant[]
}

/** D-3 이내 빨강, D-7 이내 노랑 */
function dotColor(daysLeft: number): string {
  if (daysLeft <= 3) return 'bg-red-500'
  if (daysLeft <= 7) return 'bg-amber-500'
  return 'bg-slate-300'
}

export function ExpiringTenants({ tenants }: Props) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">만료 예정 테넌트</h2>
        <Link to="/tenants" className="text-xs font-medium text-indigo-600">
          전체보기
        </Link>
      </div>

      <ul className="mt-3 space-y-2">
        {tenants.map((t) => (
          <li key={t.id} className="flex items-center gap-2.5 text-sm">
            <span
              className={`h-2 w-2 shrink-0 rounded-full ${dotColor(t.days_left)}`}
              aria-hidden="true"
            />
            <Link
              to={`/tenants/${t.id}`}
              className="min-w-0 flex-1 truncate text-slate-700 hover:text-indigo-600"
            >
              {t.name}
            </Link>
            <span className="shrink-0 text-xs text-slate-500">
              {t.days_left}일 후 만료
            </span>
          </li>
        ))}
        {tenants.length === 0 && (
          <li className="text-sm text-slate-400">만료 예정 테넌트가 없습니다.</li>
        )}
      </ul>
    </section>
  )
}
