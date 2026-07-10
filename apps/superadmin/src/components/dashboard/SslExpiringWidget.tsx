import { Link } from 'react-router'
import { ShieldAlert } from 'lucide-react'
import type { ExpiringSslDomain } from '@/hooks/useDashboard'

interface Props {
  domains: ExpiringSslDomain[]
}

export function SslExpiringWidget({ domains }: Props) {
  if (domains.length === 0) return null

  return (
    <section className="rounded-xl border border-amber-200 bg-amber-50 p-5">
      <div className="flex items-center gap-2">
        <ShieldAlert className="h-4 w-4 text-amber-600" aria-hidden="true" />
        <h2 className="text-sm font-semibold text-amber-800">
          SSL 만료 예정 도메인 ({domains.length})
        </h2>
      </div>
      <ul className="mt-3 space-y-1.5">
        {domains.map((d) => (
          <li
            key={d.domain}
            className="flex items-center justify-between text-sm text-amber-900"
          >
            <span className="min-w-0 truncate">{d.domain}</span>
            <span
              className={
                d.days_left <= 7
                  ? 'shrink-0 font-semibold text-red-600'
                  : 'shrink-0 text-amber-700'
              }
            >
              D-{d.days_left}
            </span>
          </li>
        ))}
      </ul>
      <Link
        to="/tenants"
        className="mt-3 inline-block text-xs font-medium text-amber-700 hover:underline"
      >
        도메인 관리로 이동
      </Link>
    </section>
  )
}
