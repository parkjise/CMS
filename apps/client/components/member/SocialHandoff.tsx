'use client'

import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { exchangeSocialHandoff } from '@/lib/memberAuth'
import { useMemberStore } from '@/lib/memberStore'
import { sitePath } from '@/lib/siteHost'

interface SocialHandoffProps {
  slug: string
  navigate?: (path: string) => void
}

const goTo = (path: string) => {
  window.location.replace(path)
}

/** 고객 도메인에서 소셜 로그인 마무리 — 일회용 코드로 이 도메인의 세션을 받는다 (T-137) */
const SocialHandoff = ({ slug, navigate = goTo }: SocialHandoffProps) => {
  const params = useSearchParams()
  const setSession = useMemberStore((s) => s.setSession)
  const [failed, setFailed] = useState(false)
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    const code = params.get('code')
    if (!code) {
      setFailed(true)
      return
    }
    exchangeSocialHandoff(slug, code)
      .then((session) => {
        setSession(slug, session)
        navigate(session.return_to)
      })
      .catch(() => setFailed(true))
  }, [params, slug, setSession, navigate])

  if (failed) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-white px-6 text-center">
        <p role="alert" className="text-sm text-slate-600">
          로그인 시간이 만료되었습니다. 다시 시도해 주세요.
        </p>
        <a
          href={sitePath(slug, '/member/login')}
          className="mt-6 rounded-md bg-slate-900 px-5 py-3 text-sm font-medium text-white"
        >
          로그인으로 돌아가기
        </a>
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

export default SocialHandoff
