'use client'

import { useMemo } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useAuthOptions } from '@/hooks/member/useMemberAuth'
import { useMemberStore } from '@/lib/memberStore'
import { providerLabel, type SocialProvider } from '@/lib/memberSocial'
import InquiriesTab from './InquiriesTab'
import NotificationsTab from './NotificationsTab'
import ProfileTab from './ProfileTab'
import ReservationsTab from './ReservationsTab'

type TabKey = 'reservations' | 'inquiries' | 'notifications' | 'profile'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'reservations', label: '내 예약' },
  { key: 'inquiries', label: '문의 내역' },
  { key: 'notifications', label: '알림 설정' },
  { key: 'profile', label: '내 정보' },
]

/** 마이페이지 (기획서 16.7) — 업종별 탭 구성 (예약 기능이 없으면 "내 예약" 숨김) */
const MypageView = ({ slug }: { slug: string }) => {
  const router = useRouter()
  const pathname = usePathname()
  const search = useSearchParams()
  const member = useMemberStore((s) => s.member)
  const logout = useMemberStore((s) => s.logout)
  const options = useAuthOptions(slug)
  const reservations = options.data?.reservations ?? false

  const tabs = useMemo(
    () => TABS.filter((tab) => tab.key !== 'reservations' || reservations),
    [reservations],
  )
  const requested = search.get('tab') as TabKey | null
  const active: TabKey = tabs.some((t) => t.key === requested)
    ? (requested as TabKey)
    : tabs[0].key
  const linked = search.get('linked')?.toUpperCase() as SocialProvider | undefined

  const select = (key: TabKey) => {
    const params = new URLSearchParams(search.toString())
    params.set('tab', key)
    params.delete('linked')
    router.replace(`${pathname}?${params.toString()}`)
  }

  const handleLogout = async () => {
    await logout()
    window.location.assign(`/${slug}`)
  }

  if (!options.data) {
    return <p className="text-center text-sm text-[color:var(--color-text-muted)]">불러오는 중…</p>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-lg font-semibold text-[color:var(--color-text-primary)]">
          안녕하세요, {member?.name} 님 👋
        </p>
        <button type="button" className="text-sm text-[color:var(--color-text-muted)] underline" onClick={handleLogout}>
          로그아웃
        </button>
      </div>

      {linked && (linked === 'KAKAO' || linked === 'NAVER') && (
        <p role="status" className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {providerLabel(linked)} 계정이 연결되었습니다.
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
