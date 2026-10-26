'use client'

import { useNotifications, useUpdateNotification } from '@/hooks/member/useMemberAccount'
import type { NotificationSettings } from '@/lib/memberAccount'
import { FormError } from '../fields'

const ITEMS: { key: keyof NotificationSettings; label: string; reservation?: boolean }[] = [
  { key: 'notify_reservation_confirmed', label: '예약 확정 알림', reservation: true },
  { key: 'notify_reservation_cancelled', label: '예약 취소 알림', reservation: true },
  { key: 'marketing_agree', label: '마케팅/이벤트 알림' },
  { key: 'sms_agree', label: '문자 수신' },
  { key: 'email_agree', label: '이메일 수신' },
]

interface NotificationsTabProps {
  slug: string
  /** 예약 기능이 없는 업종은 예약 알림 항목 숨김 (기획서 16.2) */
  reservations: boolean
}

/** 알림 설정 탭 — 토글 즉시 저장 (낙관적 업데이트) */
const NotificationsTab = ({ slug, reservations }: NotificationsTabProps) => {
  const settings = useNotifications(slug)
  const update = useUpdateNotification(slug)
  if (!settings.data) return <FormError message={settings.error?.message} />

  return (
    <section className="space-y-1">
      <ul className="divide-y divide-[color:var(--color-border)]">
        {ITEMS.filter((item) => reservations || !item.reservation).map((item) => {
          const on = settings.data[item.key]
          return (
            <li key={item.key} className="flex items-center justify-between py-3">
              <span className="text-sm text-[color:var(--color-text-primary)]">{item.label}</span>
              <button
                type="button"
                role="switch"
                aria-checked={on}
                aria-label={item.label}
                onClick={() => update.mutate({ [item.key]: !on })}
                className={`relative h-6 w-11 rounded-full transition ${on ? 'bg-[var(--color-primary)]' : 'bg-slate-300'}`}
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${on ? 'left-[22px]' : 'left-0.5'}`}
                />
              </button>
            </li>
          )
        })}
      </ul>
      <FormError message={update.error ? `저장하지 못했습니다. ${update.error.message}` : null} />
    </section>
  )
}

export default NotificationsTab
