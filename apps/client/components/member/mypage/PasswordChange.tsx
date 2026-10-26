'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useChangePassword } from '@/hooks/member/useMemberAccount'
import { MESSAGES, isPasswordValid } from '@/lib/memberSchemas'
import { Field, FormError, TextInput, primaryButtonClass } from '../fields'
import PasswordStrength from '../PasswordStrength'
import PhoneVerification from '../PhoneVerification'

const schema = z
  .object({
    current_password: z.string(),
    password: z.string().refine(isPasswordValid, MESSAGES.password),
    password_confirm: z.string(),
  })
  .refine((v) => v.password === v.password_confirm, {
    path: ['password_confirm'],
    message: MESSAGES.passwordConfirm,
  })
type Values = z.infer<typeof schema>

interface PasswordChangeProps {
  slug: string
  hasPassword: boolean
  phone: string | null
  onDone: () => void
}

/** 비밀번호 변경 — 소셜 가입자 첫 설정은 휴대폰 인증 (T-111 MYPAGE) */
const PasswordChange = ({ slug, hasPassword, phone, onDone }: PasswordChangeProps) => {
  const change = useChangePassword(slug)
  const [verificationId, setVerificationId] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    watch,
    setError,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { current_password: '', password: '', password_confirm: '' },
  })

  const onSubmit = (values: Values) => {
    setFormError(null)
    if (hasPassword && !values.current_password) {
      setError('current_password', { message: '현재 비밀번호를 입력해주세요' })
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
            ? setError('current_password', { message: error.message })
            : setFormError(error.message),
      },
    )
  }

  return (
    <form noValidate onSubmit={handleSubmit(onSubmit)} className="space-y-3 rounded-md bg-[var(--color-surface)] p-4">
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
        hint={<PasswordStrength value={watch('password')} />}>
        <TextInput id="new_password" type="password" autoComplete="new-password"
          invalid={Boolean(errors.password)} {...register('password')} />
      </Field>
      <Field id="new_password_confirm" label="새 비밀번호 확인" required error={errors.password_confirm?.message}>
        <TextInput id="new_password_confirm" type="password" autoComplete="new-password"
          invalid={Boolean(errors.password_confirm)} {...register('password_confirm')} />
      </Field>
      <FormError message={formError} />
      <button type="submit" className={primaryButtonClass} disabled={change.isPending}>
        {hasPassword ? '비밀번호 변경' : '비밀번호 설정'}
      </button>
    </form>
  )
}

export default PasswordChange
