import { PLAN_TYPES } from '@/lib/plans'

export interface FilterValue {
  q: string
  plan_type: string
  is_active: string // '', 'true', 'false'
}

interface Props {
  value: FilterValue
  onChange: (next: FilterValue) => void
}

export function TenantFilters({ value, onChange }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        type="search"
        value={value.q}
        onChange={(e) => onChange({ ...value, q: e.target.value })}
        placeholder="이름 또는 slug 검색"
        className="w-56 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
      />
      <select
        value={value.plan_type}
        onChange={(e) => onChange({ ...value, plan_type: e.target.value })}
        className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
      >
        <option value="">전체 플랜</option>
        {PLAN_TYPES.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>
      <select
        value={value.is_active}
        onChange={(e) => onChange({ ...value, is_active: e.target.value })}
        className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
      >
        <option value="">전체 상태</option>
        <option value="true">활성</option>
        <option value="false">비활성</option>
      </select>
    </div>
  )
}
