import { Lock } from 'lucide-react'
import { Badge, Toggle } from '@cms/ui'
import { meetsPlan } from '@/lib/plans'
import {
  useTenantFeatures,
  useToggleFeature,
  type TenantFeatureItem,
} from '@/hooks/useTenant'

interface Props {
  tenantId: string
  tenantPlan: string
}

const CATEGORY_LABELS: Record<string, string> = {
  CONTENT: '콘텐츠',
  NOTIFICATION: '알림',
  AI: 'AI',
  SEO: 'SEO',
  ANALYTICS: '분석',
  INTEGRATION: '연동',
}

export function FeaturesTab({ tenantId, tenantPlan }: Props) {
  const { data: features, isLoading } = useTenantFeatures(tenantId)
  const toggle = useToggleFeature(tenantId)

  if (isLoading) {
    return <p className="text-sm text-slate-400">불러오는 중…</p>
  }
  if (!features || features.length === 0) {
    return <p className="text-sm text-slate-400">등록된 기능이 없습니다.</p>
  }

  const grouped = features.reduce<Record<string, TenantFeatureItem[]>>((acc, f) => {
    ;(acc[f.category] ??= []).push(f)
    return acc
  }, {})

  return (
    <div className="max-w-2xl space-y-6">
      {Object.entries(grouped).map(([category, items]) => (
        <section key={category}>
          <h3 className="mb-2 text-xs font-semibold uppercase text-slate-400">
            {CATEGORY_LABELS[category] ?? category}
          </h3>
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {items.map((f) => {
              const locked = !meetsPlan(tenantPlan, f.required_plan)
              return (
                <li
                  key={f.feature_id}
                  className="flex items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-800">
                        {f.name}
                      </span>
                      {f.is_beta && <Badge variant="info">BETA</Badge>}
                      {!f.is_active && <Badge variant="default">미배포</Badge>}
                    </div>
                    {locked && (
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-amber-600">
                        <Lock className="h-3 w-3" />
                        {f.required_plan} 플랜 업그레이드 필요
                      </p>
                    )}
                  </div>
                  <Toggle
                    checked={f.is_enabled}
                    disabled={locked || toggle.isPending}
                    onChange={(e) =>
                      toggle.mutate({
                        featureId: f.feature_id,
                        enabled: e.target.checked,
                      })
                    }
                    aria-label={`${f.name} 토글`}
                  />
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </div>
  )
}
