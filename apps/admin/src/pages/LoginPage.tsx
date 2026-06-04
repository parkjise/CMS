import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useAuthStore } from '@/stores/authStore'

const schema = z.object({
  email: z.string().email('유효한 이메일을 입력하세요.'),
  password: z.string().min(1, '비밀번호를 입력하세요.'),
  tenant_slug: z
    .string()
    .min(1, '슬러그를 입력하세요.')
    .regex(/^[a-z0-9-]+$/, '영소문자, 숫자, 하이픈(-)만 사용 가능합니다.'),
})

type FormValues = z.infer<typeof schema>

export function LoginPage() {
  const navigate = useNavigate()
  const login = useAuthStore((s) => s.login)
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  const onSubmit = async (values: FormValues) => {
    setServerError(null)
    try {
      await login(values.email, values.password, values.tenant_slug)
      navigate('/admin/dashboard', { replace: true })
    } catch {
      setServerError('이메일, 비밀번호 또는 슬러그를 확인하세요.')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="w-full max-w-sm p-8 bg-white rounded-2xl shadow-sm border border-slate-200">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900">CMS 관리자</h1>
          <p className="mt-1 text-sm text-slate-500">로그인하여 관리자 페이지에 접속하세요.</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          {/* 이메일 */}
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1">
              이메일
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="admin@example.com"
              {...register('email')}
              className={[
                'w-full rounded-lg border px-3 py-2 text-sm outline-none transition',
                'placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500',
                errors.email ? 'border-red-400 bg-red-50' : 'border-slate-300 bg-white',
              ].join(' ')}
            />
            {errors.email && (
              <p className="mt-1 text-xs text-red-500">{errors.email.message}</p>
            )}
          </div>

          {/* 비밀번호 */}
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1">
              비밀번호
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              {...register('password')}
              className={[
                'w-full rounded-lg border px-3 py-2 text-sm outline-none transition',
                'placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500',
                errors.password ? 'border-red-400 bg-red-50' : 'border-slate-300 bg-white',
              ].join(' ')}
            />
            {errors.password && (
              <p className="mt-1 text-xs text-red-500">{errors.password.message}</p>
            )}
          </div>

          {/* 테넌트 슬러그 */}
          <div>
            <label htmlFor="tenant_slug" className="block text-sm font-medium text-slate-700 mb-1">
              사이트 슬러그
            </label>
            <div className="flex items-center rounded-lg border border-slate-300 bg-white focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 overflow-hidden">
              <span className="px-3 py-2 text-sm text-slate-400 bg-slate-50 border-r border-slate-300 select-none whitespace-nowrap">
                site.com/
              </span>
              <input
                id="tenant_slug"
                type="text"
                autoComplete="off"
                placeholder="my-store"
                {...register('tenant_slug')}
                className={[
                  'flex-1 px-3 py-2 text-sm outline-none bg-transparent',
                  errors.tenant_slug ? 'bg-red-50' : '',
                ].join(' ')}
              />
            </div>
            {errors.tenant_slug && (
              <p className="mt-1 text-xs text-red-500">{errors.tenant_slug.message}</p>
            )}
          </div>

          {/* 서버 에러 */}
          {serverError && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-600">
              {serverError}
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className={[
              'w-full rounded-lg py-2.5 px-4 text-sm font-semibold text-white transition',
              'bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2',
              isSubmitting ? 'opacity-60 cursor-not-allowed' : '',
            ].join(' ')}
          >
            {isSubmitting ? '로그인 중...' : '로그인'}
          </button>
        </form>
      </div>
    </div>
  )
}
