'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useCountdown } from '@/hooks/useCountdown'
import { useResetPassword, useResetToken } from '@/hooks/member/useMemberAuth'
import { resetPasswordSchema, type ResetPasswordValues } from '@/lib/memberSchemas'
import { Field, FormError, TextInput, primaryButtonClass } from './fields'
import PasswordStrength from './PasswordStrength'

interface ResetPasswordFormProps {
  slug: string
  token: string
}

const REDIRECT_SECONDS = 3

/** 새 비밀번호 설정 (기획서 16.6 Step 3 · 4) — 링크 확인 후 화면 표시 */
const ResetPasswordForm = ({ slug, token }: ResetPasswordFormProps) => {
  const router = useRouter()
  const check = useResetToken(slug, token)
  const reset = useResetPassword(slug)
  const redirect = useCountdown()
  const [done, setDone] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const loginHref = `/${slug}/member/login`
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: '', password_confirm: '' },
  })
  const password = watch('password')

  useEffect(() => {
    if (done && !redirect.active) router.replace(loginHref)
  }, [done, redirect.active, router, loginHref])

  const invalid = !token || check.isError
  if (invalid) {
    return (
      <div className="space-y-4 text-center">
        <p role="alert" className="text-sm text-[color:var(--color-text-secondary)]">
          유효하지 않거나 만료된 링크입니다.
        </p>
        <Link href={`/${slug}/member/find-password`} className={`block ${primaryButtonClass}`}>
          비밀번호 찾기 다시 시도
        </Link>
      </div>
    )
  }
  if (check.isLoading) {
    return <p className="text-center text-sm text-[color:var(--color-text-muted)]">확인 중…</p>
  }
  if (done) {
    return (
      <div className="space-y-3 text-center" role="status">
        <p className="font-semibold text-[color:var(--color-text-primary)]">
          ✓ 비밀번호가 변경되었습니다.
        </p>
        <p className="text-sm text-[color:var(--color-text-muted)]">
          {redirect.remaining}초 후 로그인 페이지로 이동합니다.
        </p>
        <Link href={loginHref} className={`block ${primaryButtonClass}`}>
          지금 로그인하기
        </Link>
      </div>
    )
  }

  const onSubmit = (values: ResetPasswordValues) => {
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
  }

  return (
    <form noValidate onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {check.data && (
        <p className="text-center text-sm text-[color:var(--color-text-secondary)]">
          {check.data.masked_email} 계정의 새 비밀번호를 입력해주세요.
        </p>
      )}
      <Field id="password" label="새 비밀번호" required error={errors.password?.message}
        hint={<PasswordStrength value={password} />}>
        <TextInput id="password" type="password" autoComplete="new-password"
          invalid={Boolean(errors.password)} {...register('password')} />
      </Field>
      <Field id="password_confirm" label="새 비밀번호 확인" required
        error={errors.password_confirm?.message}>
        <TextInput id="password_confirm" type="password" autoComplete="new-password"
          invalid={Boolean(errors.password_confirm)} {...register('password_confirm')} />
      </Field>
      <FormError message={formError} />
      <button type="submit" className={primaryButtonClass} disabled={reset.isPending}>
        비밀번호 변경하기
      </button>
    </form>
  )
}

export default ResetPasswordForm
