import { useNavigate } from 'react-router'
import { superApi } from '@/lib/superApi'
import type { RecentTenant } from '@/hooks/useDashboard'

interface Props {
  tenants: RecentTenant[]
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diffMs / 60000)
  if (min < 1) return '방금 전'
  if (min < 60) return `${min}분 전`
  const hours = Math.floor(min / 60)
  if (hours < 24) return `${hours}시간 전`
  const days = Math.floor(hours / 24)
  return `${days}일 전`
}

export function RecentTenants({ tenants }: Props) {
  const navigate = useNavigate()

  const handleImpersonate = async (id: string) => {
    try {
      const { data } = await superApi.post(`/v1/tenants/${id}/impersonate`)
      const url = data.data?.redirect_url
      if (url) window.open(url, '_blank', 'noopener')
    } catch {
      // 실패는 무시 (권한/네트워크). 상세 UI는 T-090에서 처리.
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900">최근 신규 테넌트</h2>

      <ul className="mt-3 divide-y divide-slate-100">
        {tenants.map((t) => (
          <li
            key={t.id}
            className="flex items-center justify-between gap-3 py-2.5 text-sm"
          >
            <div className="min-w-0">
              <span className="font-medium text-slate-800">{t.name}</span>
              <span className="ml-1.5 text-xs text-slate-400">
                ({t.plan_type}) · {relativeTime(t.created_at)}
              </span>
            </div>
            <div className="flex shrink-0 gap-1.5">
              <button
                type="button"
                onClick={() => navigate(`/tenants/${t.id}`)}
                className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
              >
                설정
              </button>
              <button
                type="button"
                onClick={() => navigate(`/tenants/${t.id}`)}
                className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
              >
                플랜변경
              </button>
              <button
                type="button"
                onClick={() => handleImpersonate(t.id)}
                className="rounded-md bg-indigo-600 px-2 py-1 text-xs font-medium text-white hover:bg-indigo-700"
              >
                접속
              </button>
            </div>
          </li>
        ))}
        {tenants.length === 0 && (
          <li className="py-2.5 text-sm text-slate-400">신규 테넌트가 없습니다.</li>
        )}
      </ul>
    </section>
  )
}
