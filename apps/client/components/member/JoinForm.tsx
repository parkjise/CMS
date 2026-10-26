'use client'

import Link from 'next/link'
import { useJoinForm } from '@/hooks/member/useMemberForms'
import { MESSAGES } from '@/lib/memberSchemas'
import { Checkbox, Field, FormError, TextInput, primaryButtonClass } from './fields'
import PasswordStrength from './PasswordStrength'
import PhoneVerification from './PhoneVerification'
import SocialButtons from './SocialButtons'

interface JoinFormProps {
  slug: string
  next?: string | null
}

/** 일반 회원가입 (기획서 16.3) — 공통 화면 (로직: useJoinForm) */
const JoinForm = ({ slug, next }: JoinFormProps) => {
  const join = useJoinForm(slug, next)
  const {
    register,
    formState: { errors },
  } = join.form
  const { password, phone } = join

  const emailHint =
    join.emailAvailable === null ? null : join.emailAvailable ? (
      <span className="text-emerald-600">✓ 사용 가능한 이메일입니다</span>
    ) : (
      <span className="text-red-600">이미 사용 중인 이메일입니다</span>
    )

  return (
    <div className="space-y-6">
      <SocialButtons slug={slug} mode="join" returnTo={join.target} />

      <form noValidate onSubmit={join.onSubmit} className="space-y-4">
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
          phone={phone.phone}
          onPhoneChange={phone.setPhone}
          verified={phone.verified}
          onVerified={phone.onVerified}
          onReset={phone.onReset}
          phoneError={phone.phoneError}
          verifyError={phone.verifyError}
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

        <FormError message={join.formError} />
        <button type="submit" className={primaryButtonClass} disabled={join.pending}>
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
