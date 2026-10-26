'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useCountdown } from '@/hooks/useCountdown'
import { useForgotPassword } from '@/hooks/member/useMemberAuth'
import type { ForgotPasswordResult } from '@/lib/memberAuth'
import { findPasswordSchema, type FindPasswordValues } from '@/lib/memberSchemas'
import { Field, FormError, TextInput, primaryButtonClass, secondaryButtonClass } from './fields'
import PhoneVerification from './PhoneVerification'

interface FindPasswordFormProps {
  slug: string
}

/** 비밀번호 찾기 (기획서 16.6) — 이메일 + 휴대폰 인증 → 재설정 링크 메일 */
const FindPasswordForm = ({ slug }: FindPasswordFormProps) => {
  const forgot = useForgotPassword(slug)
  const resend = useCountdown()
  const [sent, setSent] = useState<ForgotPasswordResult | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    getValues,
    clearErrors,
    formState: { errors },
  } = useForm<FindPasswordValues>({
    resolver: zodResolver(findPasswordSchema),
    defaultValues: { email: '', phone: '', phone_verification_id: '' },
  })
  const phone = watch('phone')
  const verificationId = watch('phone_verification_id')

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

  if (sent) {
    return (
      <div className="space-y-4 text-center">
        <p className="font-semibold text-[color:var(--color-text-primary)]">
          📧 이메일을 확인해주세요
        </p>
        <p className="text-sm text-[color:var(--color-text-secondary)]">
          {sent.masked_email} 으로 비밀번호 재설정 링크를 보냈어요.
          <br />
          링크는 {sent.expires_in_minutes}분간 유효합니다.
        </p>
        <p className="text-xs text-[color:var(--color-text-muted)]">
          이메일을 받지 못하셨나요? 스팸 메일함을 확인해보세요.
        </p>
        <button
          type="button"
          className={`w-full ${secondaryButtonClass}`}
          disabled={resend.active || forgot.isPending}
          onClick={() => request(getValues())}
        >
          {resend.active ? `재발송하기 (${resend.remaining}초)` : '재발송하기'}
        </button>
        <FormError message={formError} />
        {sent.debug_reset_url && (
          <a href={sent.debug_reset_url} className="block text-xs text-amber-600 underline">
            개발용: 재설정 링크 열기
          </a>
        )}
        <Link href={`/${slug}/member/login`} className={`block ${primaryButtonClass}`}>
          로그인으로 돌아가기
        </Link>
      </div>
    )
  }

  return (
    <form noValidate onSubmit={handleSubmit(request)} className="space-y-4">
      <Field id="email" label="이메일" required error={errors.email?.message}>
        <TextInput id="email" type="email" autoComplete="email" placeholder="가입한 이메일 주소"
          invalid={Boolean(errors.email)} {...register('email')} />
      </Field>
      <PhoneVerification
        slug={slug}
        purpose="RESET_PW"
        phone={phone}
        onPhoneChange={(value) => setValue('phone', value)}
        verified={Boolean(verificationId)}
        onVerified={(id) => {
          setValue('phone_verification_id', id)
          clearErrors(['phone', 'phone_verification_id'])
        }}
        onReset={() => setValue('phone_verification_id', '')}
        phoneError={errors.phone?.message}
        verifyError={errors.phone_verification_id?.message}
      />
      <FormError message={formError} />
      <button type="submit" className={primaryButtonClass} disabled={forgot.isPending}>
        재설정 링크 보내기
      </button>
      <Link href={`/${slug}/member/login`} className="block text-center text-sm text-[color:var(--color-text-muted)]">
        ← 로그인으로 돌아가기
      </Link>
    </form>
  )
}

export default FindPasswordForm
