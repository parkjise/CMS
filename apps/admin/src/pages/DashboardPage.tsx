import { useQueryClient } from '@tanstack/react-query'
import { Eye, MessageCircle, MessageSquare, UserPlus, Users } from 'lucide-react'
import { RecentInquiryList } from '@/components/dashboard/RecentInquiryList'
import { SampleReminder } from '@/components/dashboard/SampleReminder'
import { StatCard } from '@/components/dashboard/StatCard'
import { VisitorChart } from '@/components/dashboard/VisitorChart'
import {
  useDashboardChart,
  useDashboardStats,
  useRecentInquiries,
} from '@/hooks/useDashboard'
import { useSSENotifications } from '@/hooks/useSSENotifications'

export function DashboardPage() {
  const queryClient = useQueryClient()

  const stats = useDashboardStats()
  const chart = useDashboardChart()
  const recent = useRecentInquiries()
  // 샘플 안내 · 카드 수(회원 카드)는 통계 응답으로 정해진다 — 오기 전에는 본문 자리만
  // 잡아 두고 한 번에 그려 화면이 밀리지 않게 한다 (T-043-A)
  const bodyReady = !stats.isLoading

  const { isConnected } = useSSENotifications({
    // 실시간 연결은 첫 화면이 그려진 뒤에 — 첫 데이터와 연결 · 대역폭을 다투지 않게 (T-043-A)
    enabled: bodyReady,
    onNewInquiry: () => {
      // 새 문의 도착 시 stats + 미확인 목록 즉시 갱신
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'stats'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'recent'] })
    },
  })

  return (
    <div className="space-y-6 p-6 md:p-8">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">대시보드</h1>
          <p className="mt-1 text-sm text-slate-500">
            오늘의 방문자와 신규 문의를 한눈에 확인하세요.
          </p>
        </div>
        {/* 연결 상태 글자가 바뀌어도 폭 · 높이가 그대로이게 — 왼쪽 설명 줄바꿈이 바뀌어 밀리지 않게 (T-043-A) */}
        <div className="flex w-32 shrink-0 items-center justify-end gap-2 whitespace-nowrap text-sm">
          <span
            className={`inline-block h-2 w-2 rounded-full ${
              isConnected ? 'bg-emerald-500' : 'bg-slate-300'
            }`}
            role="img"
            aria-label={isConnected ? '실시간 알림 연결됨' : '연결 끊김'}
          />
          <span className="text-slate-500">
            {isConnected ? '실시간 알림 ON' : '연결 중...'}
          </span>
        </div>
      </div>

      {!bodyReady ? (
        <div
          role="status"
          aria-label="대시보드 불러오는 중"
          className="h-[36rem] animate-pulse rounded-lg bg-slate-100/70"
        />
      ) : (
        <>
          {/* 템플릿 샘플이 남아 있으면 할 일 안내 (기획서 11.8) */}
          <SampleReminder count={stats.data?.sample_count ?? 0} />

          {/* 통계 카드 — 회원 기능이 켜져 있으면 신규 회원 카드 추가 (T-115) */}
          <div
            className={`grid grid-cols-1 gap-4 sm:grid-cols-2 ${
              stats.data?.members ? 'lg:grid-cols-5' : 'lg:grid-cols-4'
            }`}
          >
            <StatCard
              title="오늘 방문자"
              value={stats.data?.today_unique_visitors ?? 0}
              secondary={`페이지뷰 ${stats.data?.today_page_views ?? 0}회`}
              icon={Users}
              isLoading={stats.isLoading}
              accent="blue"
            />
            <StatCard
              title="이번주 방문자"
              value={stats.data?.week_unique_visitors ?? 0}
              secondary={`페이지뷰 ${stats.data?.week_page_views ?? 0}회`}
              icon={Eye}
              isLoading={stats.isLoading}
              accent="emerald"
            />
            <StatCard
              title="오늘 신규 문의"
              value={stats.data?.new_inquiries_today ?? 0}
              icon={MessageCircle}
              isLoading={stats.isLoading}
              accent="amber"
            />
            <StatCard
              title="미처리 문의"
              value={stats.data?.pending_inquiries ?? 0}
              secondary="응대가 필요해요"
              icon={MessageSquare}
              isLoading={stats.isLoading}
              accent="rose"
            />
            {stats.data?.members && (
              <StatCard
                title="이번주 신규 회원"
                value={stats.data.members.new_members_week}
                secondary={`전체 회원 ${stats.data.members.total_members}명`}
                icon={UserPlus}
                accent="emerald"
              />
            )}
          </div>

          {/* 차트 + 미확인 문의 목록 */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
              <h2 className="mb-4 text-base font-semibold text-slate-900">
                최근 7일 방문자 추이
              </h2>
              <VisitorChart data={chart.data} isLoading={chart.isLoading} />
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="mb-4 text-base font-semibold text-slate-900">
                최근 미확인 문의
              </h2>
              <RecentInquiryList
                inquiries={recent.data}
                isLoading={recent.isLoading}
              />
            </div>
          </div>
        </>
      )}
    </div>
  )
}
