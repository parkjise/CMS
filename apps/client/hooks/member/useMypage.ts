'use client'

/**
 * 마이페이지 · 탈퇴 화면 로직 (T-124) — 화면과 분리한 headless 훅.
 * 공통 화면(components/member/mypage)과 코드형 템플릿 화면이 함께 쓴다.
 */
import { useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useAuthOptions } from '@/hooks/member/useMemberAuth'
import {
  useCancelReservation,
  useChangePassword,
  useMe,
  useReservations,
  useUpdateMe,
  useWithdraw,
} from '@/hooks/member/useMemberAccount'
import type {
  MemberProfile,
  MemberReservation,
  ReservationStatus,
  WithdrawalReason,
} from '@/lib/memberAccount'
import { addDays, formatDate, formatTime, formatWon } from '@/lib/memberFormat'
import { MESSAGES, isPasswordValid } from '@/lib/memberSchemas'
import { providerLabel, type SocialProvider } from '@/lib/memberSocial'
import { useMemberStore } from '@/lib/memberStore'

// ── 탭 ──────────────────────────────────────────────────────────────────────

export type MypageTab = 'reservations' | 'inquiries' | 'notifications' | 'profile'

export const MYPAGE_TABS: { key: MypageTab; label: string }[] = [
  { key: 'reservations', label: '내 예약' },
  { key: 'inquiries', label: '문의 내역' },
  { key: 'notifications', label: '알림 설정' },
  { key: 'profile', label: '내 정보' },
]

/** 업종별 탭 구성 (예약 기능이 없으면 "내 예약" 숨김) · ?tab= · 로그아웃 · 소셜 연결 안내 */
export const useMypageView = (slug: string) => {
  const router = useRouter()
  const pathname = usePathname()
  const search = useSearchParams()
  const member = useMemberStore((s) => s.member)
  const logout = useMemberStore((s) => s.logout)
  const options = useAuthOptions(slug)
  const reservations = options.data?.reservations ?? false

  const tabs = useMemo(
    () => MYPAGE_TABS.filter((tab) => tab.key !== 'reservations' || reservations),
    [reservations],
  )
  const requested = search.get('tab') as MypageTab | null
  const active: MypageTab = tabs.some((t) => t.key === requested)
    ? (requested as MypageTab)
    : tabs[0].key
  const linkedRaw = search.get('linked')?.toUpperCase()
  const linked =
    linkedRaw === 'KAKAO' || linkedRaw === 'NAVER' ? (linkedRaw as SocialProvider) : null

  const select = (key: MypageTab) => {
    const params = new URLSearchParams(search.toString())
    params.set('tab', key)
    params.delete('linked')
    router.replace(`${pathname}?${params.toString()}`)
  }

  const signOut = async () => {
    await logout()
    window.location.assign(`/${slug}`)
  }

  return {
    ready: Boolean(options.data),
    memberName: member?.name ?? '',
    tabs,
    active,
    select,
    signOut,
    reservations,
    linkedNotice: linked ? `${providerLabel(linked)} 계정이 연결되었습니다.` : null,
  }
}

// ── 내 예약 ─────────────────────────────────────────────────────────────────

export const RESERVATION_STATUS_LABELS: Record<ReservationStatus, string> = {
  PENDING: '대기중',
  CONFIRMED: '예약 확정',
  COMPLETED: '완료',
  CANCELLED: '취소',
}

export const RESERVATION_MONTHS = [
  { value: 3, label: '최근 3개월' },
  { value: 6, label: '최근 6개월' },
  { value: 12, label: '최근 1년' },
  { value: 0, label: '전체 기간' },
]

export const useReservationList = (slug: string) => {
  const [status, setStatus] = useState<ReservationStatus | null>(null)
  const [months, setMonths] = useState<number>(3)
  const reservations = useReservations(slug, status, months || null)
  const cancel = useCancelReservation(slug)

  return {
    status,
    setStatus,
    months,
    setMonths,
    items: reservations.data?.items ?? [],
    loading: reservations.isLoading,
    error: cancel.error?.message ?? reservations.error?.message ?? null,
    cancel: (id: string) => cancel.mutate(id),
    cancelling: cancel.isPending,
  }
}

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value : null
const num = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null
const VISIT_TYPES: Record<string, string> = { FIRST: '초진', REVISIT: '재진' }

export interface ReservationView {
  /** 큰 글씨 — 일시 또는 (일반) 제목 */
  title: string | null
  /** 일반 예약의 일시 (제목 아래) */
  when: string | null
  /** 진료과 · 초진 / 1박 · 객실 · 인원 */
  meta: string | null
  /** 결제 금액 (숙박) */
  amount: string | null
  cancellable: boolean
}

/** 업종별 예약 카드 내용 (기획서 16.7 — 병원: 일시 · 진료과 · 초진/재진, 펜션: 기간 · 객실 · 인원 · 금액) */
export const describeReservation = (r: MemberReservation): ReservationView => {
  const d = r.detail
  const cancellable =
    (r.status === 'PENDING' || r.status === 'CONFIRMED') &&
    (r.reserved_at === null || new Date(r.reserved_at).getTime() > Date.now())

  if (r.reservation_type === 'LODGING') {
    const nights = num(d.nights)
    const guests = num(d.guests)
    const amount = num(d.amount)
    const facts = [nights && `${nights}박`, text(d.room), guests && `성인 ${guests}명`].filter(Boolean)
    return {
      title: r.reserved_at
        ? `${formatDate(r.reserved_at)}${nights ? ` ~ ${formatDate(addDays(r.reserved_at, nights)).slice(5)}` : ''}`
        : null,
      when: null,
      meta: facts.length ? facts.join(' · ') : null,
      amount: amount !== null ? `결제 금액: ${formatWon(amount)}` : null,
      cancellable,
    }
  }
  const when = r.reserved_at ? `${formatDate(r.reserved_at)} ${formatTime(r.reserved_at)}` : null
  if (r.reservation_type === 'MEDICAL') {
    const visit = text(d.visit_type)
    const facts = [text(d.department), visit && (VISIT_TYPES[visit] ?? visit)].filter(Boolean)
    return {
      title: when,
      when: null,
      meta: facts.length ? facts.join(' · ') : text(d.subject),
      amount: null,
      cancellable,
    }
  }
  return { title: text(d.subject), when, meta: null, amount: null, cancellable }
}

// ── 알림 설정 ───────────────────────────────────────────────────────────────

export const NOTIFICATION_ITEMS = [
  {
    key: 'notify_reservation_confirmed',
    label: '예약 확정 알림',
    help: '예약이 확정되면 바로 알려드려요.',
    reservation: true,
  },
  {
    key: 'notify_reservation_cancelled',
    label: '예약 취소 알림',
    help: '예약이 취소·변경되면 알려드려요.',
    reservation: true,
  },
  { key: 'marketing_agree', label: '마케팅/이벤트 알림', help: '새 소식과 혜택을 받아볼 수 있어요.' },
  { key: 'sms_agree', label: '문자 수신', help: '위 알림을 문자(알림톡)로 받아요.' },
  { key: 'email_agree', label: '이메일 수신', help: '위 알림을 이메일로 받아요.' },
] as const

// ── 내 정보 ─────────────────────────────────────────────────────────────────

export type ProfileField = 'name' | 'phone' | 'birth_date' | 'password'
const NAME_RE = /^[가-힣a-zA-Z ]{2,100}$/

export const useProfileEditor = (slug: string) => {
  const me = useMe(slug)
  const update = useUpdateMe(slug)
  const [editing, setEditing] = useState<ProfileField | null>(null)
  const [draft, setDraft] = useState('')
  const [phoneVerificationId, setPhoneVerificationId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const profile: MemberProfile | undefined = me.data

  const start = (field: ProfileField) => {
    setError(null)
    setNotice(null)
    setEditing(field)
    setPhoneVerificationId('')
    setDraft(field === 'name' ? (profile?.name ?? '') : field === 'birth_date' ? (profile?.birth_date ?? '') : '')
  }

  const save = () => {
    setError(null)
    if (editing === 'name' && !NAME_RE.test(draft.trim())) return setError(MESSAGES.name)
    if (editing === 'phone' && !phoneVerificationId) return setError(MESSAGES.phoneVerified)
    const patch =
      editing === 'name'
        ? { name: draft.trim() }
        : editing === 'phone'
          ? { phone: draft.trim(), phone_verification_id: phoneVerificationId }
          : { birth_date: draft || null }
    update.mutate(patch, {
      onSuccess: () => {
        setEditing(null)
        setNotice('저장되었습니다.')
      },
      onError: (err) => setError(err.message),
    })
  }

  return {
    profile,
    loadError: me.error?.message ?? null,
    editing,
    start,
    cancel: () => setEditing(null),
    draft,
    setDraft,
    phoneVerificationId,
    setPhoneVerificationId,
    save,
    saving: update.isPending,
    error,
    notice,
    passwordChanged: () => {
      setEditing(null)
      setNotice('비밀번호가 변경되었습니다. 다른 기기에서는 다시 로그인해야 합니다.')
    },
  }
}

const passwordChangeSchema = z
  .object({
    current_password: z.string(),
    password: z.string().refine(isPasswordValid, MESSAGES.password),
    password_confirm: z.string(),
  })
  .refine((v) => v.password === v.password_confirm, {
    path: ['password_confirm'],
    message: MESSAGES.passwordConfirm,
  })
type PasswordChangeValues = z.infer<typeof passwordChangeSchema>

/** 비밀번호 변경 — 소셜 가입자 첫 설정은 휴대폰 인증 (T-111 MYPAGE) */
export const usePasswordChangeForm = (slug: string, hasPassword: boolean, onDone: () => void) => {
  const change = useChangePassword(slug)
  const [verificationId, setVerificationId] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const form = useForm<PasswordChangeValues>({
    resolver: zodResolver(passwordChangeSchema),
    defaultValues: { current_password: '', password: '', password_confirm: '' },
  })

  const onSubmit = form.handleSubmit((values) => {
    setFormError(null)
    if (hasPassword && !values.current_password) {
      form.setError('current_password', { message: '현재 비밀번호를 입력해주세요' })
      return
    }
    if (!hasPassword && !verificationId) {
      setFormError(MESSAGES.phoneVerified)
      return
    }
    change.mutate(
      {
        password: values.password,
        password_confirm: values.password_confirm,
        ...(hasPassword
          ? { current_password: values.current_password }
          : { phone_verification_id: verificationId }),
      },
      {
        onSuccess: onDone,
        onError: (error) =>
          error.field === 'current_password'
            ? form.setError('current_password', { message: error.message })
            : setFormError(error.message),
      },
    )
  })

  return {
    form,
    onSubmit,
    verificationId,
    setVerificationId,
    formError,
    pending: change.isPending,
    password: form.watch('password'),
  }
}

// ── 탈퇴 ────────────────────────────────────────────────────────────────────

export const useWithdrawForm = (slug: string, onDone: () => void) => {
  const me = useMe(slug)
  const withdraw = useWithdraw(slug)
  const [reason, setReason] = useState<WithdrawalReason | ''>('')
  const [detail, setDetail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [blocked, setBlocked] = useState(false)
  const needsPassword = me.data?.has_password ?? true

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault()
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

  return {
    loaded: Boolean(me.data),
    loadError: me.error?.message ?? null,
    needsPassword,
    reason,
    setReason,
    detail,
    setDetail,
    password,
    setPassword,
    submit,
    error,
    /** 진행 중 예약 때문에 막힘 → 내 예약 안내 */
    blocked,
    pending: withdraw.isPending,
  }
}
