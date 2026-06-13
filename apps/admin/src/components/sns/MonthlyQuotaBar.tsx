interface MonthlyQuotaBarProps {
  used: number
}

/**
 * 이번 달 발송 카운트 표시. 실제 한도는 백엔드 플랜별 정책으로 검증됨.
 * (BASIC=0, STANDARD=100, PREMIUM=무제한)
 */
export function MonthlyQuotaBar({ used }: MonthlyQuotaBarProps) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-baseline justify-between">
        <span className="text-sm text-slate-600">이번 달 발송 현황</span>
        <span className="text-lg font-semibold text-slate-900">
          {used.toLocaleString()}건
        </span>
      </div>
      <p className="mt-1 text-xs text-slate-500">
        플랜별 한도 — BASIC 미지원 · STANDARD 100건/월 · PREMIUM 무제한
      </p>
    </div>
  )
}
