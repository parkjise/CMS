import { useState } from 'react'
import dayjs from 'dayjs'
import { Button, toast } from '@cms/ui'
import {
  type InquiryDetail,
  type MemberReservationStatus,
  useUpdateMemberReservation,
} from '@/hooks/useInquiries'

const STATUS_LABELS: Record<MemberReservationStatus, string> = {
  PENDING: '대기중',
  CONFIRMED: '예약 확정',
  COMPLETED: '완료',
  CANCELLED: '취소',
}
const STATUS_STYLES: Record<MemberReservationStatus, string> = {
  PENDING: 'bg-amber-100 text-amber-800',
  CONFIRMED: 'bg-emerald-100 text-emerald-800',
  COMPLETED: 'bg-sky-100 text-sky-800',
  CANCELLED: 'bg-rose-100 text-rose-700',
}
const ACTION_LABELS: Record<Exclude<MemberReservationStatus, 'PENDING'>, string> = {
  CONFIRMED: '예약 확정',
  COMPLETED: '완료 처리',
  CANCELLED: '예약 취소',
}
const TYPE_LABELS = { MEDICAL: '진료', LODGING: '숙박', GENERAL: '일반' } as const

interface MemberReservationPanelProps {
  inquiry: InquiryDetail
  /** 예약 상태가 바뀌면 문의 상태 · 메모도 서버에서 바뀌므로 상세 폼에 반영한다 */
  onChanged?: (updated: InquiryDetail) => void
}

/**
 * 회원 정보 + 회원 예약 처리 (T-115, 기획서 AD-04 · 16.7)
 * 확정 · 취소하면 회원 알림 설정에 따라 문자/메일이 간다.
 */
export function MemberReservationPanel({ inquiry, onChanged }: MemberReservationPanelProps) {
  const update = useUpdateMemberReservation()
  const [confirming, setConfirming] = useState<Exclude<MemberReservationStatus, 'PENDING'> | null>(null)
  const { member, reservation } = inquiry
  if (!member && !reservation) return null

  const apply = (status: Exclude<MemberReservationStatus, 'PENDING'>) => {
    update.mutate(
      { id: inquiry.id, status },
      {
        onSuccess: (updated) => {
          setConfirming(null)
          onChanged?.(updated)
          toast.success(`${ACTION_LABELS[status]} 처리했습니다.`)
        },
        onError: () => toast.error('예약 상태를 바꾸지 못했습니다.'),
      },
    )
  }

  return (
    <section
      aria-label="회원 정보"
      className="space-y-3 rounded-md border border-indigo-100 bg-indigo-50/50 p-4"
    >
      {member && (
        <div className="space-y-1 text-sm">
          <p className="font-semibold text-slate-900">
            회원 정보
            {!member.is_active && (
              <span className="ml-2 text-xs font-normal text-slate-500">(탈퇴 · 비활성)</span>
            )}
          </p>
          <p className="text-slate-700">
            {member.name} · {member.email}
            {member.phone ? ` · ${member.phone}` : ''}
          </p>
          <p className="text-xs text-slate-500">가입일 {dayjs(member.created_at).format('YYYY-MM-DD')}</p>
        </div>
      )}

      {reservation && (
        <div className="space-y-2 border-t border-indigo-100 pt-3">
          <div className="flex items-center gap-2 text-sm">
            <span className="font-semibold text-slate-900">
              회원 예약 ({TYPE_LABELS[reservation.reservation_type]})
            </span>
            <span
              data-status={reservation.status}
              className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLES[reservation.status]}`}
            >
              {STATUS_LABELS[reservation.status]}
            </span>
          </div>
          {reservation.reserved_at && (
            <p className="text-sm text-slate-700">
              {dayjs(reservation.reserved_at).format('YYYY-MM-DD HH:mm')}
            </p>
          )}

          {reservation.next_statuses.length > 0 &&
            (confirming ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-slate-600">
                  {ACTION_LABELS[confirming]}할까요? 회원에게 알림이 갈 수 있습니다.
                </span>
                <Button size="sm" variant="ghost" onClick={() => setConfirming(null)}>
                  아니요
                </Button>
                <Button
                  size="sm"
                  variant={confirming === 'CANCELLED' ? 'danger' : 'primary'}
                  disabled={update.isPending}
                  onClick={() => apply(confirming)}
                >
                  {ACTION_LABELS[confirming]}
                </Button>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {reservation.next_statuses.map((status) => (
                  <Button
                    key={status}
                    size="sm"
                    variant={status === 'CANCELLED' ? 'secondary' : 'primary'}
                    onClick={() => setConfirming(status as Exclude<MemberReservationStatus, 'PENDING'>)}
                  >
                    {ACTION_LABELS[status as Exclude<MemberReservationStatus, 'PENDING'>]}
                  </Button>
                ))}
              </div>
            ))}
        </div>
      )}
    </section>
  )
}
