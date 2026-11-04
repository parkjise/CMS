import { useEffect, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import type { User } from '@cms/types'
import { apiErrorMessage } from '@/lib/errors'
import { superApi } from '@/lib/superApi'

interface TwoFactorStepProps {
  mode: 'verify' | 'enroll'
  challengeToken: string
  onDone: (token: string, user: User) => void
  onBack: () => void
}

interface Enrollment {
  secret: string
  otpauth_uri: string
}

const CODE_PATTERN = /^\d{6}$/

/** 로그인 2단계 — 인증 앱 코드 입력, 첫 로그인이면 앱 등록부터 (기획서 14.8, T-136) */
export const TwoFactorStep = ({ mode, challengeToken, onDone, onBack }: TwoFactorStepProps) => {
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (mode !== 'enroll') return
    let cancelled = false
    superApi
      .post('/v1/auth/2fa/enroll', { challenge_token: challengeToken })
      .then(({ data }) => {
        if (!cancelled) setEnrollment(data.data as Enrollment)
      })
      .catch((e) => {
        if (!cancelled) setError(apiErrorMessage(e, '인증 앱 등록을 시작하지 못했습니다.'))
      })
    return () => {
      cancelled = true
    }
  }, [mode, challengeToken])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!CODE_PATTERN.test(code)) {
      setError('인증 앱의 숫자 6자리를 입력하세요.')
      return
    }
    setSubmitting(true)
    try {
      const path = mode === 'enroll' ? '/v1/auth/2fa/enroll/confirm' : '/v1/auth/verify-2fa'
      const { data } = await superApi.post(path, { challenge_token: challengeToken, code })
      const { access_token, user } = data.data as { access_token: string; user: User }
      onDone(access_token, user)
    } catch (err) {
      setCode('')
      setError(apiErrorMessage(err, '인증 코드가 올바르지 않습니다.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-sm"
    >
      <h1 className="mb-1 text-2xl font-bold text-slate-900">
        {mode === 'enroll' ? '인증 앱 등록' : '2단계 인증'}
      </h1>
      <p className="mb-6 text-sm text-slate-500">
        {mode === 'enroll'
          ? 'Google Authenticator 같은 인증 앱으로 아래 QR 코드를 찍은 뒤 코드를 입력하세요.'
          : '인증 앱에 표시된 숫자 6자리를 입력하세요.'}
      </p>

      {enrollment && (
        <div className="mb-6 flex flex-col items-center gap-3">
          <QRCodeSVG value={enrollment.otpauth_uri} size={176} title="인증 앱 등록 QR 코드" />
          <div className="w-full text-center">
            <p className="text-xs text-slate-500">QR 코드를 찍을 수 없으면 이 키를 직접 입력하세요</p>
            <code className="mt-1 block break-all text-sm font-medium text-slate-800">
              {enrollment.secret}
            </code>
          </div>
        </div>
      )}

      <label htmlFor="totp-code" className="mb-1 block text-sm font-medium text-slate-700">
        인증 코드
      </label>
      <input
        id="totp-code"
        value={code}
        onChange={(e) => setCode(e.target.value.trim())}
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        autoFocus
        className="mb-4 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm tracking-widest outline-none focus:border-slate-500"
        placeholder="000000"
      />

      {error && (
        <p role="alert" className="mb-4 text-sm text-red-600">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting || (mode === 'enroll' && !enrollment)}
        className="h-10 w-full rounded-lg bg-slate-900 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-60"
      >
        {submitting ? '확인 중…' : '확인'}
      </button>
      <button
        type="button"
        onClick={onBack}
        className="mt-3 h-10 w-full rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50"
      >
        처음으로
      </button>
    </form>
  )
}
