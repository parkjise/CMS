'use client'

import { useEffect, useState } from 'react'
import { ArrowUp, LogIn, MessageCircle, Pencil, X } from 'lucide-react'
import { useClientAuthStore } from '@/lib/authStore'
import { useEditStore } from '@/lib/editStore'
import { LoginModal } from '@/components/auth/LoginModal'
import { ExitConfirmDialog } from './ExitConfirmDialog'

interface FloatingButtonsProps {
  tenantSlug: string
  kakaoUrl: string | null
}

const SCROLL_TRIGGER = 200

export function FloatingButtons({ tenantSlug, kakaoUrl }: FloatingButtonsProps) {
  const isLoggedIn = useClientAuthStore((s) => s.isLoggedIn)
  const isEditMode = useEditStore((s) => s.isEditMode)
  const toggleEditMode = useEditStore((s) => s.toggleEditMode)
  const isDirty = useEditStore((s) => s.isDirty)

  const [showScrollTop, setShowScrollTop] = useState(false)
  const [hydrated, setHydrated] = useState(false)
  const [loginOpen, setLoginOpen] = useState(false)
  const [exitOpen, setExitOpen] = useState(false)

  useEffect(() => {
    setHydrated(true)
  }, [])

  useEffect(() => {
    const onScroll = () => setShowScrollTop(window.scrollY > SCROLL_TRIGGER)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const handleAuthClick = () => {
    if (!isLoggedIn) {
      setLoginOpen(true)
      return
    }
    if (isEditMode && isDirty) {
      setExitOpen(true)
      return
    }
    toggleEditMode()
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
    <>
      <div className="pointer-events-none fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
        {showScrollTop && (
          <button
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            aria-label="맨 위로"
            className="pointer-events-auto flex h-12 w-12 items-center justify-center rounded-[var(--border-radius-pill)] border border-[color:var(--color-border)] bg-[var(--color-background)] text-[color:var(--color-text-secondary)] shadow-[var(--shadow-floating)] transition hover:bg-[var(--color-surface)]"
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
            className="pointer-events-auto flex h-12 w-12 items-center justify-center rounded-[var(--border-radius-pill)] bg-[var(--color-kakao)] text-[color:var(--color-kakao-text)] shadow-[var(--shadow-floating)] transition hover:brightness-95"
          >
            <MessageCircle className="h-5 w-5" />
          </a>
        )}

        <button
          type="button"
          onClick={handleAuthClick}
          aria-label={authLabel}
          className={[
            'pointer-events-auto flex items-center gap-2 rounded-[var(--border-radius-pill)] px-4 py-3 text-sm font-medium shadow-[var(--shadow-floating)] transition',
            isLoggedIn && isEditMode
              ? 'bg-[var(--color-danger)] text-[color:var(--color-on-danger)] hover:bg-[var(--color-danger-hover)]'
              : isLoggedIn
                ? 'bg-[var(--color-primary)] text-[color:var(--color-on-primary)] hover:bg-[var(--color-primary-hover)]'
                : 'border border-[color:var(--color-border)] bg-[var(--color-background)] text-[color:var(--color-text-secondary)] hover:bg-[var(--color-surface)]',
          ].join(' ')}
        >
          <AuthIcon className="h-4 w-4" />
          <span className="hidden sm:inline">{authLabel}</span>
        </button>
      </div>

      <LoginModal
        open={loginOpen}
        onClose={() => setLoginOpen(false)}
        tenantSlug={tenantSlug}
      />

      <ExitConfirmDialog
        open={exitOpen}
        onClose={() => setExitOpen(false)}
        onExit={toggleEditMode}
      />
    </>
  )
}
