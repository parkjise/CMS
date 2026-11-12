import { PLAN_TYPES } from '@/lib/plans'
import { TEMPLATE_LABELS, TENANT_SORTS, type TenantSort } from '@/lib/tenantList'

export interface FilterValue {
  q: string
  plan_type: string
  template_type: string
  is_active: string // '', 'true', 'false'
  sort: TenantSort
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
        aria-label="사업체 검색"
        className="w-56 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
      />
      <select
        aria-label="플랜"
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
        aria-label="업종"
        value={value.template_type}
        onChange={(e) => onChange({ ...value, template_type: e.target.value })}
        className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
      >
        <option value="">전체 업종</option>
        {Object.entries(TEMPLATE_LABELS).map(([key, label]) => (
          <option key={key} value={key}>
            {label}
          </option>
        ))}
      </select>
      <select
        aria-label="상태"
        value={value.is_active}
        onChange={(e) => onChange({ ...value, is_active: e.target.value })}
        className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
      >
        <option value="">전체 상태</option>
        <option value="true">활성</option>
        <option value="false">비활성</option>
      </select>
      <select
        aria-label="정렬"
        value={value.sort}
        onChange={(e) => onChange({ ...value, sort: e.target.value as TenantSort })}
        className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
      >
        {TENANT_SORTS.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>
    </div>
  )
}
