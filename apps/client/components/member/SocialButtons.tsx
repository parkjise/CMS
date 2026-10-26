'use client'

import { useState } from 'react'
import { useAuthOptions } from '@/hooks/member/useMemberAuth'
import { fetchSocialAuthorizeUrl, socialErrorMessage, type SocialProvider } from '@/lib/memberSocial'

interface SocialButtonsProps {
  slug: string
  /** 로그인 · 가입 화면 문구 */
  mode: 'login' | 'join'
  returnTo?: string
  /** 테스트에서 이동을 가로채기 위해 주입 */
  navigate?: (url: string) => void
}

const LABELS: Record<SocialProvider, { login: string; join: string; className: string }> = {
  KAKAO: {
    login: '카카오로 로그인',
    join: '카카오로 시작하기',
    className: 'bg-[#FEE500] text-[#191919] hover:brightness-95',
  },
  NAVER: {
    login: '네이버로 로그인',
    join: '네이버로 시작하기',
    className: 'bg-[#03C75A] text-white hover:brightness-95',
  },
}

const goTo = (url: string) => {
  window.location.assign(url)
}

/** 카카오 · 네이버 버튼 — 기능 플래그 MEMBER_SOCIAL_LOGIN OFF 면 숨김 (T-110) */
const SocialButtons = ({ slug, mode, returnTo, navigate = goTo }: SocialButtonsProps) => {
  const options = useAuthOptions(slug)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<SocialProvider | null>(null)

  if (!options.data?.social_login || options.data.providers.length === 0) return null

  const start = async (provider: SocialProvider) => {
    setError(null)
    setPending(provider)
    try {
      navigate(await fetchSocialAuthorizeUrl(slug, provider, returnTo))
    } catch (err) {
      setError(socialErrorMessage(err))
      setPending(null)
    }
  }

  return (
    <div className="space-y-2">
      {options.data.providers.map((provider) => (
        <button
          key={provider}
          type="button"
          disabled={pending !== null}
          onClick={() => void start(provider)}
          className={`w-full rounded-md px-4 py-3 text-sm font-semibold transition disabled:opacity-60 ${LABELS[provider].className}`}
        >
          {LABELS[provider][mode]}
        </button>
      ))}
      {error && (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      )}
      <div className="flex items-center gap-3 py-2 text-xs text-[color:var(--color-text-subtle)]">
        <span className="h-px flex-1 bg-[var(--color-border)]" />
        또는
        <span className="h-px flex-1 bg-[var(--color-border)]" />
      </div>
    </div>
  )
}

export default SocialButtons
