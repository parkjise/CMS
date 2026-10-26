'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useEmailAvailability, useRegister } from '@/hooks/member/useMemberAuth'
import { safeNext } from '@/lib/memberAuth'
import { MESSAGES, joinSchema, type JoinValues } from '@/lib/memberSchemas'
import { Checkbox, Field, FormError, TextInput, primaryButtonClass } from './fields'
import PasswordStrength from './PasswordStrength'
import PhoneVerification from './PhoneVerification'
import SocialButtons from './SocialButtons'

interface JoinFormProps {
  slug: string
  next?: string | null
}

/** 일반 회원가입 (기획서 16.3) */
const JoinForm = ({ slug, next }: JoinFormProps) => {
  const router = useRouter()
  const registerMutation = useRegister(slug)
  const [formError, setFormError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    setError,
    clearErrors,
    formState: { errors },
  } = useForm<JoinValues>({
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
  const email = watch('email')
  const password = watch('password')
  const phone = watch('phone')
  const verificationId = watch('phone_verification_id')
  const availability = useEmailAvailability(slug, email)
  const emailTaken = availability.data?.available === false
  const target = safeNext(slug, next)

  const onSubmit = (values: JoinValues) => {
    setFormError(null)
    if (emailTaken) {
      setError('email', { message: '이미 사용 중인 이메일입니다' })
      return
    }
    registerMutation.mutate(
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
          if (field && field in values) setError(field, { message: error.message })
          else setFormError(error.message)
        },
      },
    )
  }

  const emailHint = availability.data
    ? availability.data.available
      ? <span className="text-emerald-600">✓ 사용 가능한 이메일입니다</span>
      : <span className="text-red-600">이미 사용 중인 이메일입니다</span>
    : null

  return (
    <div className="space-y-6">
      <SocialButtons slug={slug} mode="join" returnTo={target} />

      <form noValidate onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Field id="name" label="이름" required error={errors.name?.message}>
          <TextInput id="name" autoComplete="name" placeholder="홍길동"
            invalid={Boolean(errors.name)} {...register('name')} />
        </Field>
        <Field id="email" label="이메일" required error={errors.email?.message} hint={emailHint}>
          <TextInput id="email" type="email" autoComplete="email" placeholder="example@email.com"
            invalid={Boolean(errors.email)} {...register('email')} />
        </Field>
        <Field id="password" label="비밀번호" required error={errors.password?.message}
          hint={<PasswordStrength value={password} />}>
          <TextInput id="password" type="password" autoComplete="new-password"
            invalid={Boolean(errors.password)} {...register('password')} />
        </Field>
        <Field id="password_confirm" label="비밀번호 확인" required
          error={errors.password_confirm?.message}>
          <TextInput id="password_confirm" type="password" autoComplete="new-password"
            invalid={Boolean(errors.password_confirm)} {...register('password_confirm')} />
        </Field>

        <PhoneVerification
          slug={slug}
          purpose="REGISTER"
          phone={phone}
          onPhoneChange={(value) => setValue('phone', value, { shouldValidate: false })}
          verified={Boolean(verificationId)}
          onVerified={(id) => {
            setValue('phone_verification_id', id)
            clearErrors(['phone', 'phone_verification_id'])
          }}
          onReset={() => setValue('phone_verification_id', '')}
          phoneError={errors.phone?.message}
          verifyError={errors.phone_verification_id?.message}
        />

        <Field id="birth_date" label="생년월일 (선택)">
          <TextInput id="birth_date" type="date" {...register('birth_date')} />
        </Field>

        <fieldset className="space-y-2 rounded-md bg-[var(--color-surface)] p-3">
          <legend className="sr-only">약관 동의</legend>
          <Checkbox id="terms_agree" label="이용약관 동의 (필수)" {...register('terms_agree')} />
          <Checkbox id="privacy_agree" label="개인정보처리방침 (필수)" {...register('privacy_agree')} />
          <Checkbox id="marketing_agree" label="마케팅/이벤트 알림 수신 (선택)"
            {...register('marketing_agree')} />
          {errors.terms_agree && (
            <p role="alert" className="text-xs text-red-600">{MESSAGES.terms}</p>
          )}
        </fieldset>

        <FormError message={formError} />
        <button type="submit" className={primaryButtonClass} disabled={registerMutation.isPending}>
          가입하기
        </button>
      </form>

      <p className="text-center text-sm text-[color:var(--color-text-muted)]">
        이미 회원이신가요?{' '}
        <Link href={`/${slug}/member/login`} className="font-semibold text-[color:var(--color-primary)]">
          로그인
        </Link>
      </p>
    </div>
  )
}

export default JoinForm
