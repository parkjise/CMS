import { useState } from 'react'
import { useSSENotifications } from '@/hooks/useSSENotifications'

export function DashboardPage() {
  const [newInquiryCount, setNewInquiryCount] = useState(0)

  const { isConnected, lastEvent } = useSSENotifications({
    onNewInquiry: () => {
      setNewInquiryCount((c) => c + 1)
    },
  })

  return (
    <div className="p-8">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="mb-1 text-2xl font-bold text-slate-900">대시보드</h1>
          <p className="text-sm text-slate-500">
            [AD-01] 방문자 통계 · 문의 현황 — Phase 6에서 본격 구현
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span
            className={`inline-block h-2 w-2 rounded-full ${
              isConnected ? 'bg-emerald-500' : 'bg-slate-300'
            }`}
            aria-label={isConnected ? '실시간 알림 연결됨' : '연결 끊김'}
          />
          <span className="text-slate-500">
            {isConnected ? '실시간 알림 ON' : '연결 중...'}
          </span>
        </div>
      </div>

      {newInquiryCount > 0 && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          세션 시작 후 새 문의 <strong>{newInquiryCount}건</strong>이 도착했습니다.
          {lastEvent && (
            <span className="ml-2 text-emerald-700">
              (최근: {lastEvent.name}님 · {lastEvent.inquiry_type})
            </span>
          )}
        </div>
      )}
    </div>
  )
}
