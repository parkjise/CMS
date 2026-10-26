'use client'

import { useEffect } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useIsMember, useMemberStore } from '@/lib/memberStore'

interface RequireMemberProps {
  slug: string
  children: React.ReactNode
}

/** 로그인한 방문자만 — 아니면 로그인 화면으로 (돌아올 주소 next) */
const RequireMember = ({ slug, children }: RequireMemberProps) => {
  const router = useRouter()
  const pathname = usePathname()
  const search = useSearchParams()
  const isMember = useIsMember(slug)
  const ready = useMemberStore((s) => s.slug === slug && s.status === 'ready')

  useEffect(() => {
    if (!ready || isMember) return
    const query = search.toString()
    const next = `${pathname}${query ? `?${query}` : ''}`
    router.replace(`/${slug}/member/login?next=${encodeURIComponent(next)}`)
  }, [ready, isMember, pathname, search, router, slug])

  if (!isMember) {
    return (
      <p className="py-12 text-center text-sm text-[color:var(--color-text-muted)]" aria-live="polite">
        로그인 정보를 확인하고 있습니다…
      </p>
    )
  }
  return <>{children}</>
}

export default RequireMember
