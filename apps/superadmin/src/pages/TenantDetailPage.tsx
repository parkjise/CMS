import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import { Badge, Button } from '@cms/ui'
import { useTenant } from '@/hooks/useTenant'
import { BasicInfoTab } from '@/components/tenants/tabs/BasicInfoTab'
import { FeaturesTab } from '@/components/tenants/tabs/FeaturesTab'
import { UsageTab } from '@/components/tenants/tabs/UsageTab'
import { HistoryTab } from '@/components/tenants/tabs/HistoryTab'
import { ImpersonateModal } from '@/components/tenants/ImpersonateModal'

type TabKey = 'basic' | 'features' | 'usage' | 'history'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'basic', label: '기본정보' },
  { key: 'features', label: '기능 관리' },
  { key: 'usage', label: '사용 현황' },
  { key: 'history', label: '히스토리' },
]

export function TenantDetailPage() {
  const { id = '' } = useParams()
  const [tab, setTab] = useState<TabKey>('basic')
  const [impersonateOpen, setImpersonateOpen] = useState(false)
  const { data: tenant, isLoading, isError } = useTenant(id)

  return (
    <div className="p-8">
      <Link
        to="/tenants"
        className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"
      >
        <ArrowLeft className="h-4 w-4" />
        테넌트 목록
      </Link>

      {isLoading && <p className="text-sm text-slate-400">불러오는 중…</p>}
      {isError && (
        <p className="text-sm text-red-500">테넌트를 불러오지 못했습니다.</p>
      )}

      {tenant && (
        <>
          <div className="mb-6 flex items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold text-slate-900">{tenant.name}</h1>
                <Badge variant={tenant.is_active ? 'success' : 'default'} dot>
                  {tenant.is_active ? '활성' : '비활성'}
                </Badge>
                <Badge variant="primary">{tenant.plan_type}</Badge>
              </div>
              <p className="mt-1 text-sm text-slate-400">{tenant.slug}</p>
            </div>
            <Button onClick={() => setImpersonateOpen(true)}>
              <ExternalLink className="mr-1 h-4 w-4" />
              관리자 페이지로 접속
            </Button>
          </div>

          {/* 탭 */}
          <div className="mb-6 flex gap-1 border-b border-slate-200">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition ${
                  tab === t.key
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === 'basic' && <BasicInfoTab tenant={tenant} />}
          {tab === 'features' && (
            <FeaturesTab tenantId={tenant.id} tenantPlan={tenant.plan_type} />
          )}
          {tab === 'usage' && <UsageTab tenantId={tenant.id} />}
          {tab === 'history' && <HistoryTab tenantId={tenant.id} />}

          <ImpersonateModal
            open={impersonateOpen}
            onClose={() => setImpersonateOpen(false)}
            tenantId={tenant.id}
          />
        </>
      )}
    </div>
  )
}
