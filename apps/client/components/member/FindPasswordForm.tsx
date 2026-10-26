'use client'

import Link from 'next/link'
import { useFindPasswordForm } from '@/hooks/member/useMemberForms'
import { Field, FormError, TextInput, primaryButtonClass, secondaryButtonClass } from './fields'
import PhoneVerification from './PhoneVerification'

interface FindPasswordFormProps {
  slug: string
}

/** 비밀번호 찾기 (기획서 16.6) — 이메일 + 휴대폰 인증 → 재설정 링크 메일 */
const FindPasswordForm = ({ slug }: FindPasswordFormProps) => {
  const find = useFindPasswordForm(slug)
  const {
    register,
    formState: { errors },
  } = find.form
  const { sent, phone } = find

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
          disabled={!find.canResend}
          onClick={find.resendLink}
        >
          {find.resendRemaining > 0 ? `재발송하기 (${find.resendRemaining}초)` : '재발송하기'}
        </button>
        <FormError message={find.formError} />
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
    <form noValidate onSubmit={find.onSubmit} className="space-y-4">
      <Field id="email" label="이메일" required error={errors.email?.message}>
        <TextInput id="email" type="email" autoComplete="email" placeholder="가입한 이메일 주소"
          invalid={Boolean(errors.email)} {...register('email')} />
      </Field>
      <PhoneVerification
        slug={slug}
        purpose="RESET_PW"
        phone={phone.phone}
        onPhoneChange={phone.setPhone}
        verified={phone.verified}
        onVerified={phone.onVerified}
        onReset={phone.onReset}
        phoneError={phone.phoneError}
        verifyError={phone.verifyError}
      />
      <FormError message={find.formError} />
      <button type="submit" className={primaryButtonClass} disabled={find.pending}>
        재설정 링크 보내기
      </button>
      <Link href={`/${slug}/member/login`} className="block text-center text-sm text-[color:var(--color-text-muted)]">
        ← 로그인으로 돌아가기
      </Link>
    </form>
  )
}

export default FindPasswordForm
