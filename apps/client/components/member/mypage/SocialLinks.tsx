'use client'

import { useAuthOptions } from '@/hooks/member/useMemberAuth'
import { useLinkSocial, useSocialAccounts, useUnlinkSocial } from '@/hooks/member/useMemberAccount'
import { providerLabel, type SocialProvider } from '@/lib/memberSocial'
import { FormError } from '../fields'

interface SocialLinksProps {
  slug: string
  returnTo: string
  navigate?: (url: string) => void
}

const goTo = (url: string) => {
  window.location.assign(url)
}

/** 연결된 소셜 계정 — 연결하기(소셜 로그인 화면으로) · 해제 (T-110 API) */
const SocialLinks = ({ slug, returnTo, navigate = goTo }: SocialLinksProps) => {
  const options = useAuthOptions(slug)
  const accounts = useSocialAccounts(slug)
  const link = useLinkSocial(slug)
  const unlink = useUnlinkSocial(slug)
  if (!options.data?.social_login) return null

  const linked = new Set(accounts.data?.accounts.map((a) => a.provider))
  const error = link.error ?? unlink.error

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-[color:var(--color-text-primary)]">연결된 소셜 계정</p>
      <ul className="space-y-2">
        {options.data.providers.map((provider: SocialProvider) => (
          <li key={provider} className="flex items-center justify-between text-sm">
            <span className="text-[color:var(--color-text-secondary)]">
              {providerLabel(provider)}{' '}
              <span className={linked.has(provider) ? 'text-emerald-600' : 'text-[color:var(--color-text-subtle)]'}>
                {linked.has(provider) ? '연결됨' : '미연결'}
              </span>
            </span>
            {linked.has(provider) ? (
              <button
                type="button"
                className="text-xs text-[color:var(--color-text-muted)] underline disabled:opacity-60"
                disabled={unlink.isPending}
                onClick={() => unlink.mutate(provider)}
              >
                {providerLabel(provider)} 연결 해제
              </button>
            ) : (
              <button
                type="button"
                className="text-xs font-semibold text-[color:var(--color-primary)] disabled:opacity-60"
                disabled={link.isPending}
                onClick={() =>
                  link.mutate({ provider, returnTo }, { onSuccess: (r) => navigate(r.authorize_url) })
                }
              >
                {providerLabel(provider)} 연결하기
              </button>
            )}
          </li>
        ))}
      </ul>
      <FormError message={error?.message} />
    </div>
  )
}

export default SocialLinks
