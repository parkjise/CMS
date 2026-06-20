'use client'

import { useState } from 'react'
import axios from 'axios'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useClientAuthStore } from '@/lib/authStore'

const schema = z.object({
  email: z.string().trim().email('유효한 이메일을 입력하세요.'),
  password: z.string().min(1, '비밀번호를 입력하세요.'),
})

type FormValues = z.infer<typeof schema>

interface Props {
  tenantSlug: string
  onSuccess?: () => void
  autoFocus?: boolean
}

const ADMIN_URL = process.env.NEXT_PUBLIC_ADMIN_URL ?? 'http://localhost:3001'

const INPUT_CLASS =
  'w-full rounded-[var(--border-radius-base)] border border-[color:var(--color-border-strong)] bg-[var(--color-background)] px-3 py-2 text-sm text-[color:var(--color-text-primary)] focus:border-[color:var(--color-primary)] focus:outline-none'

export function LoginForm({ tenantSlug, onSuccess, autoFocus }: Props) {
  const login = useClientAuthStore((s) => s.login)
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  })

  const onSubmit = async (values: FormValues) => {
    setServerError(null)
    try {
      await login(values.email, values.password, tenantSlug)
      onSuccess?.()
    } catch (e) {
      if (axios.isAxiosError(e)) {
        if (!e.response) {
          setServerError('서버에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.')
        } else if (e.response.status === 401) {
          setServerError('이메일 또는 비밀번호를 확인해주세요.')
        } else if (e.response.status === 429) {
          setServerError('요청이 너무 많습니다. 잠시 후 다시 시도해주세요.')
        } else {
          setServerError('로그인 처리 중 오류가 발생했습니다.')
        }
      } else {
        setServerError('알 수 없는 오류가 발생했습니다.')
      }
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div>
        <label
          htmlFor="login-email"
          className="mb-1 block text-sm font-medium text-[color:var(--color-text-secondary)]"
        >
          이메일
        </label>
        <input
          id="login-email"
          type="email"
          autoComplete="email"
          autoFocus={autoFocus}
          {...register('email')}
          className={INPUT_CLASS}
        />
        {errors.email && (
          <p className="mt-1 text-xs text-[color:var(--color-danger)]">
            {errors.email.message}
          </p>
        )}
      </div>

      <div>
        <label
          htmlFor="login-password"
          className="mb-1 block text-sm font-medium text-[color:var(--color-text-secondary)]"
        >
          비밀번호
        </label>
        <input
          id="login-password"
          type="password"
          autoComplete="current-password"
          {...register('password')}
          className={INPUT_CLASS}
        />
        {errors.password && (
          <p className="mt-1 text-xs text-[color:var(--color-danger)]">
            {errors.password.message}
          </p>
        )}
      </div>

      {serverError && (
        <div className="rounded-[var(--border-radius-base)] border border-[color:var(--color-danger)] bg-[var(--color-danger)]/10 px-3 py-2 text-sm text-[color:var(--color-danger)]">
          {serverError}
        </div>
      )}

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full rounded-[var(--border-radius-base)] bg-[var(--color-primary)] px-4 py-3 text-sm font-medium text-[color:var(--color-on-primary)] transition hover:bg-[var(--color-primary-hover)] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isSubmitting ? '로그인 중...' : '로그인'}
      </button>

      <p className="pt-2 text-center text-xs text-[color:var(--color-text-muted)]">
        <a
          href={`${ADMIN_URL}/login`}
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-[color:var(--color-primary)]"
        >
          관리자 페이지로 이동 →
        </a>
      </p>
    </form>
  )
}
