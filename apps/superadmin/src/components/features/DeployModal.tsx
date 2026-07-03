import { useMemo, useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { Button, Modal, Toggle, toast } from '@cms/ui'
import { PLAN_TYPES } from '@/lib/plans'
import { useDashboard } from '@/hooks/useDashboard'
import { useTenants } from '@/hooks/useTenants'
import {
  createDeployAnnouncement,
  useDeployFeature,
  useDeployments,
  useRollbackDeployment,
  type DeployInput,
  type FeatureItem,
} from '@/hooks/useFeatures'

interface Props {
  open: boolean
  onClose: () => void
  feature: FeatureItem
}

type Method = DeployInput['deployment_type']

const METHODS: { key: Method; label: string }[] = [
  { key: 'GLOBAL', label: '전체 배포' },
  { key: 'PLAN_BASED', label: '플랜별 배포' },
  { key: 'SELECTIVE', label: '테넌트 선택' },
  { key: 'GRADUAL', label: '점진적 배포' },
]

export function DeployModal({ open, onClose, feature }: Props) {
  const [method, setMethod] = useState<Method>('GLOBAL')
  const [plan, setPlan] = useState<string>('PREMIUM')
  const [percent, setPercent] = useState(10)
  const [selected, setSelected] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [note, setNote] = useState('')
  const [showBanner, setShowBanner] = useState(true)
  const [sendKakao, setSendKakao] = useState(false)

  const { data: dashboard } = useDashboard()
  const { data: tenantList } = useTenants({ q: search || undefined, page: 1, limit: 20 })
  const deploy = useDeployFeature(feature.id)
  const { data: deployments } = useDeployments(feature.id, open)
  const rollback = useRollbackDeployment(feature.id)

  const total = dashboard?.stats.total_tenants ?? 0
  const planCount =
    dashboard?.plan_distribution.find((p) => p.plan === plan)?.count ?? 0

  const previewCount = useMemo(() => {
    switch (method) {
      case 'GLOBAL':
        return total
      case 'PLAN_BASED':
        return planCount
      case 'GRADUAL':
        return Math.ceil((total * percent) / 100)
      case 'SELECTIVE':
        return selected.length
    }
  }, [method, total, planCount, percent, selected])

  const toggleTenant = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))

  const handleDeploy = async () => {
    const input: DeployInput = { deployment_type: method, notes: note || undefined }
    if (method === 'PLAN_BASED') input.target_plan = plan
    if (method === 'SELECTIVE') input.target_tenants = selected
    if (method === 'GRADUAL') input.rollout_percent = percent

    try {
      await deploy.mutateAsync(input)
      if (showBanner || sendKakao) {
        await createDeployAnnouncement({
          featureName: feature.name,
          note,
          sendKakao,
          deployment_type: method,
          target_plan: plan,
          target_tenants: selected,
        })
      }
      toast.success(`${previewCount}개 테넌트에 배포되었습니다.`)
      onClose()
    } catch {
      toast.error('배포에 실패했습니다.')
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={`"${feature.name}" 배포 설정`}>
      <div className="space-y-4">
        {/* 배포 방식 */}
        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold text-slate-800">배포 방식</legend>
          {METHODS.map((m) => (
            <label key={m.key} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="method"
                checked={method === m.key}
                onChange={() => setMethod(m.key)}
              />
              {m.label}
              {method === m.key && m.key === 'PLAN_BASED' && (
                <select
                  value={plan}
                  onChange={(e) => setPlan(e.target.value)}
                  className="ml-2 rounded border border-slate-300 px-2 py-1 text-xs"
                >
                  {PLAN_TYPES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              )}
              {method === m.key && m.key === 'GRADUAL' && (
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={percent}
                  onChange={(e) => setPercent(Number(e.target.value))}
                  className="ml-2 w-16 rounded border border-slate-300 px-2 py-1 text-xs"
                />
              )}
            </label>
          ))}
        </fieldset>

        {/* SELECTIVE 테넌트 선택 */}
        {method === 'SELECTIVE' && (
          <div>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="테넌트 검색"
              className="mb-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <ul className="max-h-32 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
              {tenantList?.items.map((t) => (
                <li key={t.id}>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selected.includes(t.id)}
                      onChange={() => toggleTenant(t.id)}
                    />
                    {t.name}{' '}
                    <span className="text-xs text-slate-400">({t.plan_type})</span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* 미리보기 */}
        <p className="rounded-lg bg-indigo-50 px-3 py-2 text-sm text-indigo-800">
          영향받는 테넌트: <b>{previewCount}개</b>
        </p>

        {/* 알림 */}
        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold text-slate-800">테넌트 알림</legend>
          <Toggle
            label="관리자 페이지 공지 노출"
            checked={showBanner}
            onChange={(e) => setShowBanner(e.target.checked)}
          />
          <Toggle
            label="카카오 알림톡 발송"
            checked={sendKakao}
            onChange={(e) => setSendKakao(e.target.checked)}
          />
          <Toggle label="이메일 발송 (준비 중)" checked={false} disabled />
        </fieldset>

        {/* 업데이트 노트 */}
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            업데이트 노트 (테넌트에게 노출)
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            placeholder="새 기능 설명을 입력하세요"
          />
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            취소
          </Button>
          <Button onClick={handleDeploy} loading={deploy.isPending}>
            배포 실행
          </Button>
        </div>

        {/* 배포 이력 */}
        {deployments && deployments.length > 0 && (
          <div className="border-t border-slate-100 pt-3">
            <h4 className="mb-2 text-xs font-semibold text-slate-500">배포 이력</h4>
            <ul className="space-y-1">
              {deployments.map((d) => (
                <li
                  key={d.id}
                  className="flex items-center justify-between gap-2 text-xs text-slate-600"
                >
                  <span>
                    {d.deployment_type}
                    {d.target_plan ? ` (${d.target_plan})` : ''} · {d.affected_count}개
                    · {new Date(d.deployed_at).toLocaleDateString('ko-KR')}
                  </span>
                  {d.rollback_at ? (
                    <span className="text-slate-400">롤백됨</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => rollback.mutate(d.id)}
                      className="flex items-center gap-1 text-rose-600 hover:underline"
                    >
                      <RotateCcw className="h-3 w-3" />
                      롤백
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Modal>
  )
}
