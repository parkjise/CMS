'use client'

import Link from 'next/link'
import { useResetPasswordForm } from '@/hooks/member/useMemberForms'
import { Field, FormError, TextInput, primaryButtonClass } from './fields'
import PasswordStrength from './PasswordStrength'

interface ResetPasswordFormProps {
  slug: string
  token: string
}

/** 새 비밀번호 설정 (기획서 16.6 Step 3 · 4) — 링크 확인 후 화면 표시 */
const ResetPasswordForm = ({ slug, token }: ResetPasswordFormProps) => {
  const reset = useResetPasswordForm(slug, token)
  const {
    register,
    formState: { errors },
  } = reset.form

  if (reset.step === 'invalid') {
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
  if (reset.step === 'checking') {
    return <p className="text-center text-sm text-[color:var(--color-text-muted)]">확인 중…</p>
  }
  if (reset.step === 'done') {
    return (
      <div className="space-y-3 text-center" role="status">
        <p className="font-semibold text-[color:var(--color-text-primary)]">
          ✓ 비밀번호가 변경되었습니다.
        </p>
        <p className="text-sm text-[color:var(--color-text-muted)]">
          {reset.redirectIn}초 후 로그인 페이지로 이동합니다.
        </p>
        <Link href={reset.loginHref} className={`block ${primaryButtonClass}`}>
          지금 로그인하기
        </Link>
      </div>
    )
  }

  return (
    <form noValidate onSubmit={reset.onSubmit} className="space-y-4">
      {reset.maskedEmail && (
        <p className="text-center text-sm text-[color:var(--color-text-secondary)]">
          {reset.maskedEmail} 계정의 새 비밀번호를 입력해주세요.
        </p>
      )}
      <Field id="password" label="새 비밀번호" required error={errors.password?.message}
        hint={<PasswordStrength value={reset.password} />}>
        <TextInput id="password" type="password" autoComplete="new-password"
          invalid={Boolean(errors.password)} {...register('password')} />
      </Field>
      <Field id="password_confirm" label="새 비밀번호 확인" required
        error={errors.password_confirm?.message}>
        <TextInput id="password_confirm" type="password" autoComplete="new-password"
          invalid={Boolean(errors.password_confirm)} {...register('password_confirm')} />
      </Field>
      <FormError message={reset.formError} />
      <button type="submit" className={primaryButtonClass} disabled={reset.pending}>
        비밀번호 변경하기
      </button>
    </form>
  )
}

export default ResetPasswordForm
