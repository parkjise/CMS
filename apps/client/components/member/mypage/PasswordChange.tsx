'use client'

import { usePasswordChangeForm } from '@/hooks/member/useMypage'
import { Field, FormError, TextInput, primaryButtonClass } from '../fields'
import PasswordStrength from '../PasswordStrength'
import PhoneVerification from '../PhoneVerification'

interface PasswordChangeProps {
  slug: string
  hasPassword: boolean
  phone: string | null
  onDone: () => void
}

/** 비밀번호 변경 — 소셜 가입자 첫 설정은 휴대폰 인증 (T-111 MYPAGE) */
const PasswordChange = ({ slug, hasPassword, phone, onDone }: PasswordChangeProps) => {
  const change = usePasswordChangeForm(slug, hasPassword, onDone)
  const {
    register,
    formState: { errors },
  } = change.form
  const { verificationId, setVerificationId } = change

  return (
    <form noValidate onSubmit={change.onSubmit} className="space-y-3 rounded-md bg-[var(--color-surface)] p-4">
      {hasPassword ? (
        <Field id="current_password" label="현재 비밀번호" required error={errors.current_password?.message}>
          <TextInput id="current_password" type="password" autoComplete="current-password"
            invalid={Boolean(errors.current_password)} {...register('current_password')} />
        </Field>
      ) : (
        <>
          <p className="text-xs text-[color:var(--color-text-muted)]">
            소셜로 가입한 계정이에요. 본인 확인 후 비밀번호를 설정할 수 있어요.
          </p>
          <PhoneVerification
            slug={slug}
            purpose="MYPAGE"
            phone={phone ?? ''}
            onPhoneChange={() => undefined}
            verified={Boolean(verificationId)}
            onVerified={setVerificationId}
            onReset={() => setVerificationId('')}
          />
        </>
      )}
      <Field id="new_password" label="새 비밀번호" required error={errors.password?.message}
        hint={<PasswordStrength value={change.password} />}>
        <TextInput id="new_password" type="password" autoComplete="new-password"
          invalid={Boolean(errors.password)} {...register('password')} />
      </Field>
      <Field id="new_password_confirm" label="새 비밀번호 확인" required error={errors.password_confirm?.message}>
        <TextInput id="new_password_confirm" type="password" autoComplete="new-password"
          invalid={Boolean(errors.password_confirm)} {...register('password_confirm')} />
      </Field>
      <FormError message={change.formError} />
      <button type="submit" className={primaryButtonClass} disabled={change.pending}>
        {hasPassword ? '비밀번호 변경' : '비밀번호 설정'}
      </button>
    </form>
  )
}

export default PasswordChange
