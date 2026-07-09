import { useState } from 'react'
import {
  HardDrive,
  MessageSquare,
  MessagesSquare,
  Send,
  Sparkles,
} from 'lucide-react'
import { Button, toast } from '@cms/ui'
import { AiUsageCard } from '@/components/billing/AiUsageCard'
import { CancelSubscriptionDialog } from '@/components/billing/CancelSubscriptionDialog'
import { PlanCard } from '@/components/billing/PlanCard'
import { UpgradeModal } from '@/components/billing/UpgradeModal'
import { UsageStat } from '@/components/billing/UsageStat'
import { useAiUsage } from '@/hooks/useAiUsage'
import { useInquiries } from '@/hooks/useInquiries'
import { useNotificationSettings } from '@/hooks/useNotificationSettings'
import { useSubscription } from '@/hooks/useBilling'
import { type PlanDefinition, PLANS, getPlan } from '@/lib/plans'

const STATUS_LABELS: Record<string, string> = {
  TRIAL: '무료 체험',
  ACTIVE: '정상 구독',
  PAST_DUE: '결제 연체',
  SUSPENDED: '서비스 중단',
  CANCELLED: '해지됨',
}

export function SubscriptionTab() {
  const subQuery = useSubscription()
  const [cancelOpen, setCancelOpen] = useState(false)
  const sub = subQuery.data

  const planKey = (sub?.plan_type ?? 'STANDARD') as PlanDefinition['key']
  const currentPlan = getPlan(planKey)

  const inquiriesQuery = useInquiries({ page: 1, limit: 1 })
  const notifQuery = useNotificationSettings()
  const aiUsageQuery = useAiUsage()

  const [upgradeFeature, setUpgradeFeature] = useState<string | null>(null)

  const aiUsage = aiUsageQuery.data
  const aiExceeded =
    !!aiUsage &&
    ((aiUsage.copy_suggest.exceeded && aiUsage.copy_suggest.supported) ||
      !aiUsage.chat_edit.supported ||
      aiUsage.chat_edit.exceeded)

  const totalInquiries = inquiriesQuery.data?.total ?? 0
  const monthlyKakao = notifQuery.data?.monthly_kakao_count ?? 0
  const notifLimit = currentPlan.monthlyNotifications
  const notifProgress =
    notifLimit === 0 || notifLimit >= 1_000_000
      ? null
      : Math.round((monthlyKakao / notifLimit) * 100)

  const handleUpgrade = (plan: PlanDefinition) => {
    if (plan.key === currentPlan.key) return
    toast.success(`${plan.name} 플랜 업그레이드 문의가 접수되었습니다.`)
  }

  return (
    <div className="space-y-8">
      {/* 구독 요약 */}
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-slate-900">
                {currentPlan.name} 플랜
              </h2>
              {sub && (
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                  {STATUS_LABELS[sub.status] ?? sub.status}
                </span>
              )}
            </div>
            {sub ? (
              <p className="mt-1 text-sm text-slate-500">
                다음 결제일:{' '}
                {new Date(sub.current_period_end).toLocaleDateString('ko-KR')} ·
                월 {sub.monthly_amount.toLocaleString()}원
              </p>
            ) : (
              <p className="mt-1 text-sm text-slate-400">구독 정보가 없습니다.</p>
            )}
          </div>
          {sub && sub.status !== 'CANCELLED' && (
            <Button variant="ghost" onClick={() => setCancelOpen(true)}>
              구독 해지
            </Button>
          )}
        </div>
      </section>

      {/* 사용 현황 */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold text-slate-900">사용 현황</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <UsageStat
            icon={MessageSquare}
            iconBg="bg-blue-50 text-blue-600"
            label="누적 문의 수"
            value={totalInquiries}
            hint={
              currentPlan.inquiryRetentionDays === null
                ? '영구 보관'
                : `${currentPlan.inquiryRetentionDays}일 후 자동 삭제`
            }
            isLoading={inquiriesQuery.isLoading}
          />
          <UsageStat
            icon={Send}
            iconBg="bg-amber-50 text-amber-600"
            label="이번 달 알림 발송"
            value={notifLimit === 0 ? '미지원' : monthlyKakao}
            hint={
              notifLimit === 0
                ? '현재 플랜에서는 알림 발송이 제한됩니다.'
                : notifLimit >= 1_000_000
                  ? '무제한 발송 가능'
                  : `한도 ${notifLimit.toLocaleString()}건/월`
            }
            progress={notifProgress}
            isLoading={notifQuery.isLoading}
          />
          <UsageStat
            icon={HardDrive}
            iconBg="bg-violet-50 text-violet-600"
            label="이미지 스토리지"
            value="—"
            hint={`한도 ${currentPlan.storageGb}GB`}
            pending
          />
        </div>
      </section>

      {/* AI 사용량 */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-semibold text-slate-900">
            AI 어시스턴트 사용 현황
          </h2>
          {aiExceeded && (
            <button
              type="button"
              onClick={() => setUpgradeFeature('AI 어시스턴트')}
              className="inline-flex items-center gap-1 rounded-md bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-700 hover:bg-violet-100"
            >
              <Sparkles className="h-3.5 w-3.5" />
              업그레이드 안내
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <AiUsageCard
            icon={Sparkles}
            iconBg="bg-violet-50 text-violet-600"
            label="이번 달 AI 문구 추천"
            usage={
              aiUsage?.copy_suggest ?? {
                used: 0,
                limit: null,
                remaining: null,
                exceeded: false,
                supported: true,
              }
            }
            isLoading={aiUsageQuery.isLoading}
          />
          <AiUsageCard
            icon={MessagesSquare}
            iconBg="bg-indigo-50 text-indigo-600"
            label="이번 달 AI 대화형 편집"
            usage={
              aiUsage?.chat_edit ?? {
                used: 0,
                limit: null,
                remaining: null,
                exceeded: false,
                supported: true,
              }
            }
            isLoading={aiUsageQuery.isLoading}
          />
        </div>
      </section>

      {/* 플랜 비교 */}
      <section className="space-y-4">
        <h2 className="text-base font-semibold text-slate-900">플랜 비교</h2>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {PLANS.map((plan) => (
            <PlanCard
              key={plan.key}
              plan={plan}
              isCurrent={plan.key === currentPlan.key}
              onUpgrade={handleUpgrade}
            />
          ))}
        </div>
      </section>

      <UpgradeModal
        open={upgradeFeature !== null}
        onClose={() => setUpgradeFeature(null)}
        featureName={upgradeFeature ?? ''}
        recommendedPlan="Premium"
        onUpgrade={() => {
          setUpgradeFeature(null)
          toast.success('Premium 플랜 업그레이드 문의가 접수되었습니다.')
        }}
      />

      <CancelSubscriptionDialog
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
      />
    </div>
  )
}
