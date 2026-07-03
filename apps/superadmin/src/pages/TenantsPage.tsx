import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { Plus } from 'lucide-react'
import { Badge, Button } from '@cms/ui'
import { TenantFilters, type FilterValue } from '@/components/tenants/TenantFilters'
import { CreateTenantModal } from '@/components/tenants/CreateTenantModal'
import { useTenants } from '@/hooks/useTenants'

const LIMIT = 20

export function TenantsPage() {
  const [filter, setFilter] = useState<FilterValue>({
    q: '',
    plan_type: '',
    is_active: '',
  })
  const [page, setPage] = useState(1)
  const [createOpen, setCreateOpen] = useState(false)

  const queryFilters = useMemo(
    () => ({
      q: filter.q || undefined,
      plan_type: filter.plan_type || undefined,
      is_active:
        filter.is_active === '' ? undefined : filter.is_active === 'true',
      page,
      limit: LIMIT,
    }),
    [filter, page],
  )

  const { data, isLoading, isError } = useTenants(queryFilters)
  const totalPages = data ? Math.max(1, Math.ceil(data.total / LIMIT)) : 1

  const onFilterChange = (next: FilterValue) => {
    setFilter(next)
    setPage(1)
  }

  return (
    <div className="p-8">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">테넌트 관리</h1>
          <p className="mt-1 text-sm text-slate-500">
            전체 {data?.total ?? 0}개 · 검색·필터 (SA-02)
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-1 h-4 w-4" />
          신규 테넌트
        </Button>
      </div>

      <div className="mb-4">
        <TenantFilters value={filter} onChange={onFilterChange} />
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-500">
            <tr>
              <th className="px-4 py-3">사업체</th>
              <th className="px-4 py-3">플랜</th>
              <th className="px-4 py-3">템플릿</th>
              <th className="px-4 py-3">상태</th>
              <th className="px-4 py-3">가입일</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                  불러오는 중…
                </td>
              </tr>
            )}
            {isError && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-red-500">
                  목록을 불러오지 못했습니다.
                </td>
              </tr>
            )}
            {data?.items.map((t) => (
              <tr key={t.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-800">{t.name}</div>
                  <div className="text-xs text-slate-400">{t.slug}</div>
                </td>
                <td className="px-4 py-3">{t.plan_type}</td>
                <td className="px-4 py-3 text-slate-500">{t.template_type}</td>
                <td className="px-4 py-3">
                  <Badge variant={t.is_active ? 'success' : 'default'} dot>
                    {t.is_active ? '활성' : '비활성'}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-slate-500">
                  {new Date(t.created_at).toLocaleDateString('ko-KR')}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    to={`/tenants/${t.id}`}
                    className="text-sm font-medium text-indigo-600 hover:underline"
                  >
                    상세
                  </Link>
                </td>
              </tr>
            ))}
            {data && data.items.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                  조건에 맞는 테넌트가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* 페이지네이션 */}
      <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
        <span>
          {page} / {totalPages} 페이지
        </span>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            이전
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            다음
          </Button>
        </div>
      </div>

      <CreateTenantModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  )
}
