'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useMe, useWithdraw } from '@/hooks/member/useMemberAccount'
import type { WithdrawalReason } from '@/lib/memberAccount'
import {
  Field,
  FormError,
  TextInput,
  inputClass,
  primaryButtonClass,
  secondaryButtonClass,
} from './fields'

const REASONS: { value: WithdrawalReason; label: string }[] = [
  { value: 'INCONVENIENT', label: '서비스 이용 불편' },
  { value: 'PRIVACY', label: '개인정보 보호' },
  { value: 'NOT_USING', label: '사업체 이용 안 함' },
  { value: 'OTHER', label: '기타' },
]

interface WithdrawFormProps {
  slug: string
  /** 탈퇴 완료 — 세션이 끝나므로 완료 화면은 로그인 확인(RequireMember) 밖에서 그린다 */
  onDone: () => void
}

/** 회원 탈퇴 (기획서 16.8) — 진행 중 예약이 있으면 차단 안내, 성공 시 자동 로그아웃 */
const WithdrawForm = ({ slug, onDone }: WithdrawFormProps) => {
  const me = useMe(slug)
  const withdraw = useWithdraw(slug)
  const [reason, setReason] = useState<WithdrawalReason | ''>('')
  const [detail, setDetail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [blocked, setBlocked] = useState(false)

  if (!me.data) return <FormError message={me.error?.message} />
  const needsPassword = me.data.has_password

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setBlocked(false)
    if (needsPassword && !password) return setError('비밀번호를 입력해주세요')
    withdraw.mutate(
      {
        ...(needsPassword ? { password } : {}),
        reason: reason || null,
        ...(reason === 'OTHER' && detail.trim() ? { reason_detail: detail.trim() } : {}),
      },
      {
        onSuccess: onDone,
        onError: (err) => {
          if (err.code === 'ACTIVE_RESERVATION_EXISTS') setBlocked(true)
          setError(err.message)
        },
      },
    )
  }

  return (
    <form noValidate onSubmit={submit} className="space-y-5">
      <div className="space-y-2 rounded-md bg-amber-50 p-4 text-sm text-amber-900">
        <p className="font-semibold">⚠️ 탈퇴 전 확인해주세요.</p>
        <p>탈퇴 시 아래 데이터가 삭제됩니다.</p>
        <ul className="list-inside list-disc">
          <li>예약 내역 전체</li>
          <li>문의 내역 전체</li>
          <li>알림 설정 전체</li>
        </ul>
        <p>진행 중인 예약이 있을 경우 탈퇴가 제한될 수 있습니다.</p>
      </div>

      <Field id="reason" label="탈퇴 사유 (선택)">
        <select id="reason" className={inputClass} value={reason} onChange={(e) => setReason(e.target.value as WithdrawalReason | '')}>
          <option value="">사유를 선택해주세요</option>
          {REASONS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </Field>
      {reason === 'OTHER' && (
        <TextInput id="reason_detail" aria-label="기타 사유" maxLength={400} value={detail}
          onChange={(e) => setDetail(e.target.value)} placeholder="사유를 입력해주세요" />
      )}

      {needsPassword && (
        <Field id="password" label="비밀번호 확인" required>
          <TextInput id="password" type="password" autoComplete="current-password" value={password}
            onChange={(e) => setPassword(e.target.value)} />
        </Field>
      )}

      <FormError message={error} />
      {blocked && (
        <Link href={`/${slug}/member/mypage?tab=reservations`} className="block text-center text-sm font-semibold text-[color:var(--color-primary)]">
          내 예약 확인하기
        </Link>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Link href={`/${slug}/member/mypage?tab=profile`} className={`text-center ${secondaryButtonClass}`}>
          취소
        </Link>
        <button type="submit" className="rounded-md bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60" disabled={withdraw.isPending}>
          탈퇴하기
        </button>
      </div>
    </form>
  )
}

export default WithdrawForm

export const WithdrawDone = ({ slug }: { slug: string }) => (
  <div className="space-y-4 text-center" role="status">
    <p className="font-semibold text-[color:var(--color-text-primary)]">회원 탈퇴가 완료되었습니다.</p>
    <p className="text-sm text-[color:var(--color-text-muted)]">그동안 이용해주셔서 감사합니다.</p>
    <a href={`/${slug}`} className={`block ${primaryButtonClass}`}>
      홈으로
    </a>
  </div>
)
