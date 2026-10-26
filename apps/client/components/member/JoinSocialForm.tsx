'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useSocialComplete } from '@/hooks/member/useMemberAuth'
import { MESSAGES, joinSocialSchema, type JoinSocialValues } from '@/lib/memberSchemas'
import {
  clearPendingSignup,
  loadPendingSignup,
  providerLabel,
  type PendingSocialSignup,
} from '@/lib/memberSocial'
import { Checkbox, Field, FormError, TextInput, primaryButtonClass } from './fields'
import PhoneVerification from './PhoneVerification'

interface JoinSocialFormProps {
  slug: string
}

/** 소셜 신규 가입 추가 정보 (기획서 16.3 — 휴대폰 인증 + 약관, T-110 콜백이 넘긴 값) */
const JoinSocialForm = ({ slug }: JoinSocialFormProps) => {
  const router = useRouter()
  const complete = useSocialComplete(slug)
  const [pending, setPending] = useState<PendingSocialSignup | null | undefined>(undefined)
  const [formError, setFormError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    setError,
    clearErrors,
    formState: { errors },
  } = useForm<JoinSocialValues>({
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
    if (mine) setValue('email_required', mine.emailRequired)
  }, [slug, setValue])

  if (pending === undefined) return null
  if (pending === null) {
    return (
      <div className="space-y-4 text-center">
        <p role="alert" className="text-sm text-[color:var(--color-text-secondary)]">
          가입 정보가 없거나 만료되었습니다. 소셜 로그인을 다시 시도해주세요.
        </p>
        <Link href={`/${slug}/member/login`} className={`block ${primaryButtonClass}`}>
          로그인으로 돌아가기
        </Link>
      </div>
    )
  }

  const phone = watch('phone')
  const verificationId = watch('phone_verification_id')

  const onSubmit = (values: JoinSocialValues) => {
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
          if (error.field === 'email') setError('email', { message: error.message })
          else setFormError(error.message)
        },
      },
    )
  }

  return (
    <form noValidate onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <p className="text-center text-sm text-[color:var(--color-text-secondary)]">
        {providerLabel(pending.provider)} 계정으로 가입을 완료해주세요.
      </p>

      {pending.emailRequired && (
        <Field id="email" label="이메일" required error={errors.email?.message}>
          <TextInput id="email" type="email" autoComplete="email" placeholder="example@email.com"
            invalid={Boolean(errors.email)} {...register('email')} />
        </Field>
      )}

      <PhoneVerification
        slug={slug}
        purpose="REGISTER"
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

      <fieldset className="space-y-2 rounded-md bg-[var(--color-surface)] p-3">
        <legend className="sr-only">약관 동의</legend>
        <Checkbox id="terms_agree" label="이용약관 동의 (필수)" {...register('terms_agree')} />
        <Checkbox id="privacy_agree" label="개인정보처리방침 (필수)" {...register('privacy_agree')} />
        <Checkbox id="marketing_agree" label="마케팅 알림 수신 (선택)" {...register('marketing_agree')} />
        {errors.terms_agree && (
          <p role="alert" className="text-xs text-red-600">{MESSAGES.terms}</p>
        )}
      </fieldset>

      <FormError message={formError} />
      <button type="submit" className={primaryButtonClass} disabled={complete.isPending}>
        가입 완료하기
      </button>
    </form>
  )
}

export default JoinSocialForm
