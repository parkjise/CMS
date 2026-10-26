'use client'

import Link from 'next/link'
import { useJoinSocialForm } from '@/hooks/member/useMemberForms'
import { MESSAGES } from '@/lib/memberSchemas'
import { providerLabel } from '@/lib/memberSocial'
import { Checkbox, Field, FormError, TextInput, primaryButtonClass } from './fields'
import PhoneVerification from './PhoneVerification'

interface JoinSocialFormProps {
  slug: string
}

/** 소셜 신규 가입 추가 정보 (기획서 16.3 — 휴대폰 인증 + 약관, T-110 콜백이 넘긴 값) */
const JoinSocialForm = ({ slug }: JoinSocialFormProps) => {
  const social = useJoinSocialForm(slug)
  const {
    register,
    formState: { errors },
  } = social.form
  const pending = social.signup
  const { phone } = social

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

  return (
    <form noValidate onSubmit={social.onSubmit} className="space-y-4">
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
        phone={phone.phone}
        onPhoneChange={phone.setPhone}
        verified={phone.verified}
        onVerified={phone.onVerified}
        onReset={phone.onReset}
        phoneError={phone.phoneError}
        verifyError={phone.verifyError}
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

      <FormError message={social.formError} />
      <button type="submit" className={primaryButtonClass} disabled={social.pending}>
        가입 완료하기
      </button>
    </form>
  )
}

export default JoinSocialForm
