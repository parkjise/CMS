import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@cms/ui'
import { useDashboard } from '@/hooks/useDashboard'
import { useFeatures, type FeatureItem } from '@/hooks/useFeatures'
import { FeatureCard } from '@/components/features/FeatureCard'
import { CreateFeatureModal } from '@/components/features/CreateFeatureModal'
import { DeployModal } from '@/components/features/DeployModal'

export function FeaturesPage() {
  const { data: features, isLoading, isError } = useFeatures()
  const { data: dashboard } = useDashboard()
  const total = dashboard?.stats.total_tenants ?? 0

  const [createOpen, setCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<FeatureItem | null>(null)
  const [deployTarget, setDeployTarget] = useState<FeatureItem | null>(null)

  return (
    <div className="p-8">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">기능 배포 관리</h1>
          <p className="mt-1 text-sm text-slate-500">
            기능 플래그 일괄 배포 (SA-04)
          </p>
        </div>
        <Button
          onClick={() => {
            setEditTarget(null)
            setCreateOpen(true)
          }}
        >
          <Plus className="mr-1 h-4 w-4" />
          새 기능 등록
        </Button>
      </div>

      {isLoading && <p className="text-sm text-slate-400">불러오는 중…</p>}
      {isError && (
        <p className="text-sm text-red-500">기능 목록을 불러오지 못했습니다.</p>
      )}

      <div className="space-y-3">
        {features?.map((f) => (
          <FeatureCard
            key={f.id}
            feature={f}
            totalTenants={total}
            onDeploy={() => setDeployTarget(f)}
            onEdit={() => {
              setEditTarget(f)
              setCreateOpen(true)
            }}
          />
        ))}
        {features && features.length === 0 && (
          <p className="text-sm text-slate-400">등록된 기능이 없습니다.</p>
        )}
      </div>

      <CreateFeatureModal
        open={createOpen}
        feature={editTarget}
        onClose={() => setCreateOpen(false)}
      />
      {deployTarget && (
        <DeployModal
          open={!!deployTarget}
          feature={deployTarget}
          onClose={() => setDeployTarget(null)}
        />
      )}
    </div>
  )
}
