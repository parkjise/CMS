'use client'

import Link from 'next/link'
import { useLoginForm } from '@/hooks/member/useMemberForms'
import { Checkbox, Field, FormError, TextInput, primaryButtonClass } from './fields'
import LockNotice from './LockNotice'
import SocialButtons from './SocialButtons'

interface MemberLoginFormProps {
  slug: string
  next?: string | null
}

/** 방문자 로그인 (기획서 16.4) — 공통 화면 (로직: useLoginForm) */
const MemberLoginForm = ({ slug, next }: MemberLoginFormProps) => {
  const login = useLoginForm(slug, next)
  const {
    register,
    formState: { errors },
  } = login.form

  return (
    <div className="space-y-6">
      <SocialButtons slug={slug} mode="login" returnTo={login.target} />

      <form noValidate onSubmit={login.onSubmit} className="space-y-4">
        <Field id="email" label="이메일" error={errors.email?.message}>
          <TextInput
            id="email"
            type="email"
            autoComplete="email"
            placeholder="example@email.com"
            invalid={Boolean(errors.email)}
            {...register('email')}
          />
        </Field>
        <Field id="password" label="비밀번호" error={errors.password?.message}>
          <TextInput
            id="password"
            type="password"
            autoComplete="current-password"
            invalid={Boolean(errors.password)}
            {...register('password')}
          />
        </Field>
        <Checkbox id="remember_me" label="로그인 상태 유지" {...register('remember_me')} />

        {login.locked ? (
          <LockNotice remaining={login.lockRemaining} />
        ) : (
          <FormError message={login.formError} />
        )}

        <button type="submit" className={primaryButtonClass} disabled={login.locked || login.pending}>
          로그인
        </button>
      </form>

      <nav className="flex justify-center gap-3 text-sm text-[color:var(--color-text-muted)]">
        <Link href={`/${slug}/member/find-email`}>이메일 찾기</Link>
        <span aria-hidden="true">|</span>
        <Link href={`/${slug}/member/find-password`}>비밀번호 찾기</Link>
      </nav>
      <p className="text-center text-sm text-[color:var(--color-text-muted)]">
        아직 회원이 아니신가요?{' '}
        <Link
          href={`/${slug}/member/join${next ? `?next=${encodeURIComponent(next)}` : ''}`}
          className="font-semibold text-[color:var(--color-primary)]"
        >
          회원가입
        </Link>
      </p>
    </div>
  )
}

export default MemberLoginForm
