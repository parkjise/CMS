import { Check, Sparkles } from 'lucide-react'
import { Button } from '@cms/ui'
import type { PlanDefinition } from '@/lib/plans'

interface PlanCardProps {
  plan: PlanDefinition
  isCurrent: boolean
  onUpgrade: (plan: PlanDefinition) => void
}

export function PlanCard({ plan, isCurrent, onUpgrade }: PlanCardProps) {
  return (
    <div
      className={`relative flex flex-col rounded-xl border bg-white p-6 shadow-sm transition ${
        plan.highlighted
          ? 'border-blue-500 ring-1 ring-blue-200'
          : 'border-slate-200'
      } ${isCurrent ? 'ring-2 ring-emerald-300' : ''}`}
    >
      {plan.highlighted && (
        <span className="absolute -top-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-1 rounded-full bg-blue-600 px-3 py-0.5 text-xs font-medium text-white shadow">
          <Sparkles className="h-3 w-3" />
          추천
        </span>
      )}
      {isCurrent && (
        <span className="absolute -top-3 right-4 rounded-full bg-emerald-500 px-3 py-0.5 text-xs font-medium text-white shadow">
          현재 플랜
        </span>
      )}

      <div className="mb-4">
        <h3 className="text-lg font-bold text-slate-900">{plan.name}</h3>
        <p className="mt-1 text-xs text-slate-500">{plan.tagline}</p>
      </div>

      <div className="mb-6">
        <span className="text-3xl font-bold text-slate-900">
          {plan.monthlyPrice.toLocaleString()}원
        </span>
        <span className="ml-1 text-sm text-slate-500">/ 월</span>
        <p className="mt-1 text-xs text-slate-400">{plan.target}</p>
      </div>

      <ul className="mb-6 flex-1 space-y-2.5 text-sm">
        {plan.features.map((feat) => (
          <li key={feat} className="flex items-start gap-2 text-slate-600">
            <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-500" />
            <span>{feat}</span>
          </li>
        ))}
      </ul>

      <Button
        type="button"
        variant={plan.highlighted ? 'primary' : 'secondary'}
        onClick={() => onUpgrade(plan)}
        disabled={isCurrent}
        className="w-full justify-center"
      >
        {isCurrent ? '현재 사용 중' : '업그레이드 문의'}
      </Button>
    </div>
  )
}
