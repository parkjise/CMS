'use client'

import { useEffect, useState } from 'react'
import { ArrowUp, LogIn, MessageCircle, Pencil } from 'lucide-react'
import { useClientAuthStore } from '@/lib/authStore'
import { useEditStore } from '@/lib/editStore'
import { LoginModal } from '@/components/auth/LoginModal'
import type { FloatingPosition } from '@/lib/publicSite.types'

interface FloatingButtonsProps {
  tenantSlug: string
  kakaoUrl: string | null
  /** 카카오톡 플로팅 노출 · 위치 (T-038-A) — 관리자 'SNS 노출 위치' */
  showKakao?: boolean
  kakaoPosition?: FloatingPosition
}

const SCROLL_TRIGGER = 200

export function FloatingButtons({
  tenantSlug,
  kakaoUrl,
  showKakao = true,
  kakaoPosition = 'BOTTOM_RIGHT',
}: FloatingButtonsProps) {
  const isLoggedIn = useClientAuthStore((s) => s.isLoggedIn)
  const isEditMode = useEditStore((s) => s.isEditMode)
  const enterEditMode = useEditStore((s) => s.enterEditMode)

  const [showScrollTop, setShowScrollTop] = useState(false)
  const [hydrated, setHydrated] = useState(false)
  const [loginOpen, setLoginOpen] = useState(false)

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
    enterEditMode()
  }

  // 편집 모드 진입 시에는 EditToolbar가 저장/종료를 담당하므로
  // 우하단 토글 버튼은 숨긴다 (중복 UI 제거).
  const showAuthButton = !isEditMode

  const authLabel = !hydrated
    ? '로딩 중'
    : isLoggedIn
      ? '편집 모드'
      : '관리자 로그인'

  const AuthIcon = !hydrated || !isLoggedIn ? LogIn : Pencil

  const kakaoVisible = Boolean(kakaoUrl) && showKakao
  const kakaoButton = kakaoUrl ? (
    <a
      href={kakaoUrl}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="카카오톡 채널"
      className="pointer-events-auto flex h-12 w-12 items-center justify-center rounded-[var(--border-radius-pill)] bg-[var(--color-kakao)] text-[color:var(--color-kakao-text)] shadow-[var(--shadow-floating)] transition hover:brightness-95"
    >
      <MessageCircle className="h-5 w-5" />
    </a>
  ) : null

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

        {kakaoVisible && kakaoPosition === 'BOTTOM_RIGHT' && kakaoButton}

        {showAuthButton && (
          <button
            type="button"
            onClick={handleAuthClick}
            aria-label={authLabel}
            className={[
              'pointer-events-auto flex items-center gap-2 rounded-[var(--border-radius-pill)] px-4 py-3 text-sm font-medium shadow-[var(--shadow-floating)] transition',
              isLoggedIn
                ? 'bg-[var(--color-primary)] text-[color:var(--color-on-primary)] hover:bg-[var(--color-primary-hover)]'
                : 'border border-[color:var(--color-border)] bg-[var(--color-background)] text-[color:var(--color-text-secondary)] hover:bg-[var(--color-surface)]',
            ].join(' ')}
          >
            <AuthIcon className="h-4 w-4" />
            <span className="hidden sm:inline">{authLabel}</span>
          </button>
        )}
      </div>

      {/* 좌측 하단을 고르면 카카오톡만 왼쪽으로 — 편집 · 맨 위로 버튼은 오른쪽 그대로 */}
      {kakaoVisible && kakaoPosition === 'BOTTOM_LEFT' && (
        <div className="pointer-events-none fixed bottom-6 left-6 z-50" data-testid="kakao-left">
          {kakaoButton}
        </div>
      )}

      <LoginModal
        open={loginOpen}
        onClose={() => setLoginOpen(false)}
        tenantSlug={tenantSlug}
      />
    </>
  )
}
