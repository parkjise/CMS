import { useState } from 'react'
import { useNavigate } from 'react-router'
import type { User } from '@cms/types'
import { superApi } from '@/lib/superApi'
import { useSuperAuthStore } from '@/stores/superAuthStore'

export function LoginPage() {
  const navigate = useNavigate()
  const setAuth = useSuperAuthStore((s) => s.setAuth)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!email || !password) {
      setError('이메일과 비밀번호를 입력하세요.')
      return
    }
    setSubmitting(true)
    try {
      const { data } = await superApi.post('/v1/auth/login', {
        email,
        password,
      })
      const { access_token, user } = data.data as {
        access_token: string
        user: User
      }
      setAuth(access_token, user)
      navigate('/dashboard', { replace: true })
    } catch {
      setError('이메일 또는 비밀번호가 올바르지 않습니다.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-sm"
      >
        <h1 className="mb-1 text-2xl font-bold text-slate-900">
          CMS 슈퍼 어드민
        </h1>
        <p className="mb-6 text-sm text-slate-500">운영자 전용 로그인</p>

        <label className="mb-1 block text-sm font-medium text-slate-700">
          이메일
        </label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="username"
          className="mb-4 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-blue-500"
          placeholder="admin@cms.io"
        />

        <label className="mb-1 block text-sm font-medium text-slate-700">
          비밀번호
        </label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          className="mb-4 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-blue-500"
          placeholder="••••••••"
        />

        {error && (
          <p role="alert" className="mb-4 text-sm text-red-600">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="h-10 w-full rounded-lg bg-slate-900 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-50"
        >
          {submitting ? '로그인 중…' : '로그인'}
        </button>
      </form>
    </div>
  )
}
