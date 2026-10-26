'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useCountdown } from '@/hooks/useCountdown'
import { useLogin } from '@/hooks/member/useMemberAuth'
import { safeNext } from '@/lib/memberAuth'
import { loginSchema, type LoginValues } from '@/lib/memberSchemas'
import { Checkbox, Field, FormError, TextInput, primaryButtonClass } from './fields'
import LockNotice from './LockNotice'
import SocialButtons from './SocialButtons'

interface MemberLoginFormProps {
  slug: string
  next?: string | null
}

/** 방문자 로그인 (기획서 16.4) */
const MemberLoginForm = ({ slug, next }: MemberLoginFormProps) => {
  const router = useRouter()
  const loginMutation = useLogin(slug)
  const lock = useCountdown()
  const [formError, setFormError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '', remember_me: false },
  })
  const target = safeNext(slug, next)

  const onSubmit = (values: LoginValues) => {
    setFormError(null)
    loginMutation.mutate(values, {
      onSuccess: () => router.replace(target),
      onError: (error) => {
        if (error.code === 'ACCOUNT_LOCKED') {
          lock.start(error.retryAfterSeconds ?? 1800)
          return
        }
        setFormError(error.message)
      },
    })
  }

  return (
    <div className="space-y-6">
      <SocialButtons slug={slug} mode="login" returnTo={target} />

      <form noValidate onSubmit={handleSubmit(onSubmit)} className="space-y-4">
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

        {lock.active ? <LockNotice remaining={lock.remaining} /> : <FormError message={formError} />}

        <button
          type="submit"
          className={primaryButtonClass}
          disabled={lock.active || loginMutation.isPending}
        >
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
