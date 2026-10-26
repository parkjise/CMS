'use client'

import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  completeSocialCallback,
  savePendingSignup,
  slugFromState,
  socialErrorMessage,
} from '@/lib/memberSocial'

interface SocialCallbackProps {
  // 테스트에서 이동을 가로채기 위해 주입 (기본: 브라우저 이동)
  navigate?: (path: string) => void
}

const goTo = (path: string) => {
  window.location.replace(path)
}

/**
 * 카카오 · 네이버 공용 콜백 (T-110). 인가 코드를 API 로 넘기고 결과에 따라 이동한다.
 * - LOGGED_IN / LINKED → 원래 보던 페이지 (refresh 쿠키는 API 가 심음)
 * - SIGNUP_REQUIRED → 추가 정보 화면 /{slug}/member/join-social (T-113)
 */
const SocialCallback = ({ navigate = goTo }: SocialCallbackProps) => {
  const params = useSearchParams()
  const [error, setError] = useState<string | null>(null)
  const [slug, setSlug] = useState<string | null>(null)
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true

    const code = params.get('code')
    const state = params.get('state') ?? ''
    const tenantSlug = slugFromState(state)
    setSlug(tenantSlug)

    if (params.get('error') || !code || !tenantSlug) {
      // 사용자가 동의 화면에서 취소했거나 잘못된 접근
      setError('소셜 로그인이 취소되었거나 올바르지 않은 요청입니다.')
      return
    }

    completeSocialCallback(tenantSlug, code, state)
      .then((result) => {
        if (result.status === 'SIGNUP_REQUIRED' && result.signup_token) {
          savePendingSignup({
            slug: tenantSlug,
            provider: result.provider,
            signupToken: result.signup_token,
            emailRequired: result.email_required,
            suggestedName: result.suggested_name,
            returnTo: result.return_to,
          })
          navigate(`/${tenantSlug}/member/join-social`)
          return
        }
        if (result.status === 'LINKED') {
          const joiner = result.return_to.includes('?') ? '&' : '?'
          navigate(`${result.return_to}${joiner}linked=${result.provider.toLowerCase()}`)
          return
        }
        navigate(result.return_to)
      })
      .catch((err: unknown) => setError(socialErrorMessage(err)))
  }, [params, navigate])

  if (error) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-white px-6 text-center">
        <h1 className="text-xl font-bold text-slate-900">로그인하지 못했어요</h1>
        <p role="alert" className="mt-3 max-w-md text-sm text-slate-600">
          {error}
        </p>
        {slug && (
          <a
            href={`/${slug}/member/login`}
            className="mt-6 rounded-md bg-slate-900 px-5 py-3 text-sm font-medium text-white"
          >
            로그인으로 돌아가기
          </a>
        )}
      </main>
    )
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-6">
      <p className="text-sm text-slate-500" aria-live="polite">
        로그인 중입니다…
      </p>
    </main>
  )
}

export default SocialCallback
