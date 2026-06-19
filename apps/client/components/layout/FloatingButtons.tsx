'use client'

import { useEffect, useState } from 'react'
import { ArrowUp, LogIn, MessageCircle, Pencil, X } from 'lucide-react'
import { useClientAuthStore } from '@/lib/authStore'

interface FloatingButtonsProps {
  tenantSlug: string
  kakaoUrl: string | null
}

const SCROLL_TRIGGER = 200

export function FloatingButtons({ tenantSlug, kakaoUrl }: FloatingButtonsProps) {
  const isLoggedIn = useClientAuthStore((s) => s.isLoggedIn)
  const isEditMode = useClientAuthStore((s) => s.isEditMode)
  const initialize = useClientAuthStore((s) => s.initialize)
  const toggleEditMode = useClientAuthStore((s) => s.toggleEditMode)

  const [showScrollTop, setShowScrollTop] = useState(false)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    setHydrated(true)
    initialize()
  }, [initialize])

  useEffect(() => {
    const onScroll = () => setShowScrollTop(window.scrollY > SCROLL_TRIGGER)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const handleAuthClick = () => {
    if (isLoggedIn) {
      toggleEditMode()
    } else {
      window.location.href = `/${tenantSlug}/login`
    }
  }

  const authLabel = !hydrated
    ? '로딩 중'
    : isLoggedIn
      ? isEditMode
        ? '편집 종료'
        : '편집 모드'
      : '관리자 로그인'

  const AuthIcon = !hydrated || !isLoggedIn ? LogIn : isEditMode ? X : Pencil

  return (
    <div className="pointer-events-none fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
      {showScrollTop && (
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          aria-label="맨 위로"
          className="pointer-events-auto flex h-12 w-12 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-md transition hover:bg-slate-50"
        >
          <ArrowUp className="h-5 w-5" />
        </button>
      )}

      {kakaoUrl && (
        <a
          href={kakaoUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="카카오톡 채널"
          className="pointer-events-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#FEE500] text-[#391B1B] shadow-md transition hover:brightness-95"
        >
          <MessageCircle className="h-5 w-5" />
        </a>
      )}

      <button
        type="button"
        onClick={handleAuthClick}
        aria-label={authLabel}
        className={[
          'pointer-events-auto flex items-center gap-2 rounded-full px-4 py-3 text-sm font-medium shadow-md transition',
          isLoggedIn && isEditMode
            ? 'bg-rose-600 text-white hover:bg-rose-700'
            : isLoggedIn
              ? 'bg-slate-900 text-white hover:bg-slate-800'
              : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
        ].join(' ')}
      >
        <AuthIcon className="h-4 w-4" />
        <span className="hidden sm:inline">{authLabel}</span>
      </button>
    </div>
  )
}
