import { useState } from 'react'
import { SubscriptionTab } from '@/components/billing/tabs/SubscriptionTab'
import { PaymentMethodTab } from '@/components/billing/tabs/PaymentMethodTab'
import { PaymentHistoryTab } from '@/components/billing/tabs/PaymentHistoryTab'
import { DomainTab } from '@/components/billing/tabs/DomainTab'

type TabKey = 'subscription' | 'method' | 'history' | 'domain'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'subscription', label: '구독 현황' },
  { key: 'method', label: '결제 수단' },
  { key: 'history', label: '결제 내역' },
  { key: 'domain', label: '도메인' },
]

export function BillingPage() {
  const [tab, setTab] = useState<TabKey>('subscription')

  return (
    <div className="space-y-6 p-6 md:p-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">요금제 · 결제</h1>
        <p className="mt-1 text-sm text-slate-500">
          구독·결제 수단·결제 내역·도메인을 관리합니다.
        </p>
      </div>

      <div className="flex gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition ${
              tab === t.key
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'subscription' && <SubscriptionTab />}
      {tab === 'method' && <PaymentMethodTab />}
      {tab === 'history' && <PaymentHistoryTab />}
      {tab === 'domain' && <DomainTab />}
    </div>
  )
}
