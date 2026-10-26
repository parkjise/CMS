'use client'

import { useMypageView } from '@/hooks/member/useMypage'
import InquiriesTab from './InquiriesTab'
import NotificationsTab from './NotificationsTab'
import ProfileTab from './ProfileTab'
import ReservationsTab from './ReservationsTab'

/** 마이페이지 (기획서 16.7) — 업종별 탭 구성 (예약 기능이 없으면 "내 예약" 숨김) */
const MypageView = ({ slug }: { slug: string }) => {
  const view = useMypageView(slug)
  const { tabs, active, select, reservations } = view

  if (!view.ready) {
    return <p className="text-center text-sm text-[color:var(--color-text-muted)]">불러오는 중…</p>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-lg font-semibold text-[color:var(--color-text-primary)]">
          안녕하세요, {view.memberName} 님 👋
        </p>
        <button type="button" className="text-sm text-[color:var(--color-text-muted)] underline" onClick={view.signOut}>
          로그아웃
        </button>
      </div>

      {view.linkedNotice && (
        <p role="status" className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {view.linkedNotice}
        </p>
      )}

      <div role="tablist" aria-label="마이페이지" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            id={`tab-${tab.key}`}
            aria-selected={active === tab.key}
            aria-controls={`panel-${tab.key}`}
            onClick={() => select(tab.key)}
            className={`rounded-md px-3 py-2 text-sm font-medium transition ${
              active === tab.key
                ? 'bg-[var(--color-primary)] text-[color:var(--color-on-primary)]'
                : 'bg-[var(--color-surface)] text-[color:var(--color-text-secondary)]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`panel-${active}`} aria-labelledby={`tab-${active}`}>
        {active === 'reservations' && <ReservationsTab slug={slug} />}
        {active === 'inquiries' && <InquiriesTab slug={slug} />}
        {active === 'notifications' && <NotificationsTab slug={slug} reservations={reservations} />}
        {active === 'profile' && <ProfileTab slug={slug} />}
      </div>
    </div>
  )
}

export default MypageView
