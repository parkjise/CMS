import { Badge, Button } from '@cms/ui'
import type { FeatureItem } from '@/hooks/useFeatures'

interface Props {
  feature: FeatureItem
  totalTenants: number
  onDeploy: () => void
  onEdit: () => void
}

function isNew(releasedAt: string | null): boolean {
  if (!releasedAt) return false
  const t = new Date(releasedAt).getTime()
  if (Number.isNaN(t)) return false
  return Date.now() - t <= 7 * 24 * 60 * 60 * 1000
}

export function FeatureCard({ feature, totalTenants, onDeploy, onEdit }: Props) {
  const planLabel = feature.required_plan
    ? `${feature.required_plan} 이상`
    : '전체 플랜'

  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-slate-900">{feature.name}</span>
          {feature.is_beta && <Badge variant="info">BETA</Badge>}
          {isNew(feature.released_at) && <Badge variant="success">NEW</Badge>}
          {!feature.is_active && <Badge variant="default">미배포</Badge>}
        </div>
        <p className="mt-1 text-sm text-slate-500">
          활성 테넌트: {feature.enabled_tenant_count}개 / {totalTenants}개 ·{' '}
          <span className="text-slate-400">{planLabel}</span>
        </p>
      </div>
      <div className="flex shrink-0 gap-2">
        <Button variant="secondary" size="sm" onClick={onDeploy}>
          배포 관리
        </Button>
        <Button variant="ghost" size="sm" onClick={onEdit}>
          수정
        </Button>
      </div>
    </div>
  )
}
