'use client'

/**
 * 방문자 회원 화면 로직 (T-124) — 화면(마크업 · 스타일)과 분리한 headless 훅.
 *
 * 공통 화면(Tailwind, components/member)과 코드형 템플릿 화면(templates/{key}/components/member)이
 * 같은 훅을 쓴다 → 검증 · 인증 타이머 · 잠금 · API 호출 로직은 한 곳에서만 고친다.
 */
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { formatSeconds, useCountdown } from '@/hooks/useCountdown'
import {
  useEmailAvailability,
  useFindEmail,
  useForgotPassword,
  useLogin,
  useRegister,
  useResetPassword,
  useResetToken,
  useSendPhoneCode,
  useSocialComplete,
  useVerifyPhoneCode,
} from '@/hooks/member/useMemberAuth'
import {
  safeNext,
  type FoundAccount,
  type ForgotPasswordResult,
  type VerificationPurpose,
} from '@/lib/memberAuth'
import {
  PHONE_RE,
  findEmailSchema,
  findPasswordSchema,
  joinSchema,
  joinSocialSchema,
  loginSchema,
  resetPasswordSchema,
  type FindEmailValues,
  type FindPasswordValues,
  type JoinSocialValues,
  type JoinValues,
  type LoginValues,
  type ResetPasswordValues,
} from '@/lib/memberSchemas'
import {
  clearPendingSignup,
  loadPendingSignup,
  type PendingSocialSignup,
} from '@/lib/memberSocial'

// ── 휴대폰 인증 ─────────────────────────────────────────────────────────────

export interface PhoneVerificationArgs {
  slug: string
  purpose: VerificationPurpose
  phone: string
  verified: boolean
  onVerified: (verificationId: string) => void
  onReset: () => void
}

/** 발송 → 3분 타이머 → 확인, 재발송 60초 (기획서 16.3 · 16.5 · 16.6) */
export const usePhoneVerification = ({
  slug,
  purpose,
  phone,
  verified,
  onVerified,
  onReset,
}: PhoneVerificationArgs) => {
  const send = useSendPhoneCode(slug, purpose)
  const verify = useVerifyPhoneCode(slug)
  const ttl = useCountdown()
  const cooldown = useCountdown()
  const [verificationId, setVerificationId] = useState<string | null>(null)
  const [code, setCodeState] = useState('')
  const [debugCode, setDebugCode] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const phoneValid = PHONE_RE.test(phone.trim())
  const expired = verificationId !== null && !verified && !ttl.active

  const sendCode = () => {
    setMessage(null)
    send.mutate(phone.trim(), {
      onSuccess: (result) => {
        setVerificationId(result.verification_id)
        setCodeState('')
        setDebugCode(result.debug_code)
        const seconds = Math.round((Date.parse(result.expires_at) - Date.now()) / 1000)
        ttl.start(seconds > 0 ? seconds : 180)
        cooldown.start(result.resend_after_seconds)
      },
      onError: (error) => {
        setMessage(error.message)
        if (error.retryAfterSeconds) cooldown.start(error.retryAfterSeconds)
      },
    })
  }

  const verifyCode = () => {
    if (!verificationId) return
    setMessage(null)
    verify.mutate(
      { verificationId, code },
      {
        onSuccess: () => {
          ttl.start(0)
          onVerified(verificationId)
        },
        onError: (error) => {
          const remaining = error.details[0]?.remaining_attempts
          setMessage(
            typeof remaining === 'number'
              ? `${error.message} (남은 시도 ${remaining}회)`
              : error.message,
          )
        },
      },
    )
  }

  const changeNumber = () => {
    setVerificationId(null)
    setCodeState('')
    setDebugCode(null)
    ttl.start(0)
    onReset()
  }

  return {
    phoneValid,
    sent: verificationId !== null,
    code,
    setCode: (value: string) => setCodeState(value.replace(/\D/g, '')),
    sendCode,
    verifyCode,
    changeNumber,
    canSend: phoneValid && !cooldown.active && !send.isPending,
    canVerify: code.length === 6 && !expired && !verify.isPending,
    sendLabel: cooldown.active
      ? `재발송 (${cooldown.remaining}초)`
      : verificationId
        ? '재발송'
        : '인증번호 받기',
    timer: ttl.active ? formatSeconds(ttl.remaining) : null,
    expired,
    message,
    debugCode: verified ? null : debugCode,
  }
}

/** 폼에 휴대폰 인증을 연결하는 공통 값 (phone · phone_verification_id 필드) */
const phoneFields = <T extends { phone: string; phone_verification_id: string }>(
  form: ReturnType<typeof useForm<T>>,
) => {
  // react-hook-form 의 경로 타입은 제네릭에서 좁혀지지 않아 문자열 키로 다룬다
  const f = form as unknown as ReturnType<typeof useForm<{ phone: string; phone_verification_id: string }>>
  return {
    phone: f.watch('phone'),
    verified: Boolean(f.watch('phone_verification_id')),
    setPhone: (value: string) => f.setValue('phone', value),
    onVerified: (id: string) => {
      f.setValue('phone_verification_id', id)
      f.clearErrors(['phone', 'phone_verification_id'])
    },
    onReset: () => f.setValue('phone_verification_id', ''),
    phoneError: f.formState.errors.phone?.message,
    verifyError: f.formState.errors.phone_verification_id?.message,
  }
}

/** 약관 전체 동의 (목업 "약관에 모두 동의합니다.") */
const agreeAll = <T extends { terms_agree: boolean; privacy_agree: boolean; marketing_agree: boolean }>(
  form: ReturnType<typeof useForm<T>>,
) => {
  const f = form as unknown as ReturnType<
    typeof useForm<{ terms_agree: boolean; privacy_agree: boolean; marketing_agree: boolean }>
  >
  const all = f.watch('terms_agree') && f.watch('privacy_agree') && f.watch('marketing_agree')
  return {
    checked: all,
    toggle: (on: boolean) => {
      for (const key of ['terms_agree', 'privacy_agree', 'marketing_agree'] as const) {
        f.setValue(key, on, { shouldValidate: f.formState.isSubmitted })
      }
    },
  }
}

// ── 로그인 ──────────────────────────────────────────────────────────────────

export const useLoginForm = (slug: string, next?: string | null) => {
  const router = useRouter()
  const login = useLogin(slug)
  const lock = useCountdown()
  const [formError, setFormError] = useState<string | null>(null)
  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '', remember_me: false },
  })
  const target = safeNext(slug, next)

  const onSubmit = form.handleSubmit((values) => {
    setFormError(null)
    login.mutate(values, {
      onSuccess: () => router.replace(target),
      onError: (error) => {
        if (error.code === 'ACCOUNT_LOCKED') {
          lock.start(error.retryAfterSeconds ?? 1800)
          return
        }
        setFormError(error.message)
      },
    })
  })

  return {
    form,
    onSubmit,
    target,
    formError,
    pending: login.isPending,
    locked: lock.active,
    lockRemaining: lock.remaining,
  }
}

// ── 회원가입 ────────────────────────────────────────────────────────────────

export const useJoinForm = (slug: string, next?: string | null) => {
  const router = useRouter()
  const register = useRegister(slug)
  const [formError, setFormError] = useState<string | null>(null)
  const form = useForm<JoinValues>({
    resolver: zodResolver(joinSchema),
    defaultValues: {
      name: '',
      email: '',
      password: '',
      password_confirm: '',
      phone: '',
      phone_verification_id: '',
      birth_date: '',
      terms_agree: false,
      privacy_agree: false,
      marketing_agree: false,
    },
  })
  const availability = useEmailAvailability(slug, form.watch('email'))
  const emailTaken = availability.data?.available === false
  const target = safeNext(slug, next)

  const onSubmit = form.handleSubmit((values) => {
    setFormError(null)
    if (emailTaken) {
      form.setError('email', { message: '이미 사용 중인 이메일입니다' })
      return
    }
    register.mutate(
      {
        ...values,
        name: values.name.trim(),
        email: values.email.trim(),
        birth_date: values.birth_date || null,
      },
      {
        onSuccess: () => router.replace(target),
        onError: (error) => {
          const field = error.field as keyof JoinValues | null
          if (field && field in values) form.setError(field, { message: error.message })
          else setFormError(error.message)
        },
      },
    )
  })

  return {
    form,
    onSubmit,
    target,
    formError,
    pending: register.isPending,
    password: form.watch('password'),
    /** 이메일 중복 확인 결과 — null: 아직 확인 전 */
    emailAvailable: availability.data ? availability.data.available : null,
    phone: phoneFields(form),
    agreeAll: agreeAll(form),
  }
}

// ── 소셜 가입 추가 정보 ─────────────────────────────────────────────────────

export const useJoinSocialForm = (slug: string) => {
  const router = useRouter()
  const complete = useSocialComplete(slug)
  const [pending, setPending] = useState<PendingSocialSignup | null | undefined>(undefined)
  const [formError, setFormError] = useState<string | null>(null)
  const form = useForm<JoinSocialValues>({
    resolver: zodResolver(joinSocialSchema),
    defaultValues: {
      email: '',
      email_required: false,
      phone: '',
      phone_verification_id: '',
      terms_agree: false,
      privacy_agree: false,
      marketing_agree: false,
    },
  })

  useEffect(() => {
    const saved = loadPendingSignup()
    const mine = saved && saved.slug === slug ? saved : null
    setPending(mine)
    if (mine) form.setValue('email_required', mine.emailRequired)
  }, [slug, form])

  const onSubmit = form.handleSubmit((values) => {
    if (!pending) return
    setFormError(null)
    complete.mutate(
      {
        signup_token: pending.signupToken,
        email: pending.emailRequired ? values.email?.trim() : null,
        name: pending.suggestedName,
        phone: values.phone,
        phone_verification_id: values.phone_verification_id,
        terms_agree: values.terms_agree,
        privacy_agree: values.privacy_agree,
        marketing_agree: values.marketing_agree,
      },
      {
        onSuccess: (result) => {
          clearPendingSignup()
          router.replace(result.return_to || `/${slug}`)
        },
        onError: (error) => {
          if (error.field === 'email') form.setError('email', { message: error.message })
          else setFormError(error.message)
        },
      },
    )
  })

  return {
    form,
    onSubmit,
    /** undefined: 확인 중 / null: 가입 정보 없음 (다시 로그인 안내) */
    signup: pending,
    formError,
    pending: complete.isPending,
    phone: phoneFields(form),
    agreeAll: agreeAll(form),
  }
}

// ── 이메일 찾기 ─────────────────────────────────────────────────────────────

export const useFindEmailForm = (slug: string) => {
  const find = useFindEmail(slug)
  const [accounts, setAccounts] = useState<FoundAccount[] | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const form = useForm<FindEmailValues>({
    resolver: zodResolver(findEmailSchema),
    defaultValues: { name: '', phone: '', phone_verification_id: '' },
  })

  const onSubmit = form.handleSubmit((values) => {
    setFormError(null)
    setNotFound(false)
    find.mutate(
      { name: values.name.trim(), verificationId: values.phone_verification_id },
      {
        onSuccess: (result) => setAccounts(result.accounts),
        onError: (error) =>
          error.status === 404 ? setNotFound(true) : setFormError(error.message),
      },
    )
  })

  return {
    form,
    onSubmit,
    accounts,
    notFound,
    /** 결과 화면에서 "다시 찾기" */
    retry: () => setNotFound(false),
    formError,
    pending: find.isPending,
    phone: phoneFields(form),
  }
}

// ── 비밀번호 찾기 (재설정 링크) ─────────────────────────────────────────────

export const useFindPasswordForm = (slug: string) => {
  const forgot = useForgotPassword(slug)
  const resend = useCountdown()
  const [sent, setSent] = useState<ForgotPasswordResult | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const form = useForm<FindPasswordValues>({
    resolver: zodResolver(findPasswordSchema),
    defaultValues: { email: '', phone: '', phone_verification_id: '' },
  })

  const request = (values: FindPasswordValues) => {
    setFormError(null)
    forgot.mutate(
      { email: values.email.trim(), verificationId: values.phone_verification_id },
      {
        onSuccess: (result) => {
          setSent(result)
          resend.start(result.resend_after_seconds)
        },
        onError: (error) => {
          if (error.retryAfterSeconds) resend.start(error.retryAfterSeconds)
          setFormError(error.message)
        },
      },
    )
  }

  return {
    form,
    onSubmit: form.handleSubmit(request),
    resendLink: () => request(form.getValues()),
    sent,
    canResend: !resend.active && !forgot.isPending,
    resendRemaining: resend.active ? resend.remaining : 0,
    formError,
    pending: forgot.isPending,
    phone: phoneFields(form),
  }
}

// ── 새 비밀번호 설정 ────────────────────────────────────────────────────────

const REDIRECT_SECONDS = 3

export const useResetPasswordForm = (slug: string, token: string) => {
  const router = useRouter()
  const check = useResetToken(slug, token)
  const reset = useResetPassword(slug)
  const redirect = useCountdown()
  const [done, setDone] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const loginHref = `/${slug}/member/login`
  const form = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: '', password_confirm: '' },
  })

  useEffect(() => {
    if (done && !redirect.active) router.replace(loginHref)
  }, [done, redirect.active, router, loginHref])

  const onSubmit = form.handleSubmit((values) => {
    setFormError(null)
    reset.mutate(
      { token, ...values },
      {
        onSuccess: () => {
          setDone(true)
          redirect.start(REDIRECT_SECONDS)
        },
        onError: (error) => setFormError(error.message),
      },
    )
  })

  const step: 'invalid' | 'checking' | 'form' | 'done' =
    !token || check.isError ? 'invalid' : check.isLoading ? 'checking' : done ? 'done' : 'form'

  return {
    form,
    onSubmit,
    step,
    maskedEmail: check.data?.masked_email ?? null,
    redirectIn: redirect.remaining,
    loginHref,
    formError,
    pending: reset.isPending,
    password: form.watch('password'),
  }
}
