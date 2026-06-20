'use client'

import { useEffect } from 'react'
import { X } from 'lucide-react'
import { LoginForm } from './LoginForm'

interface Props {
  open: boolean
  onClose: () => void
  tenantSlug: string
}

export function LoginModal({ open, onClose, tenantSlug }: Props) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="login-modal-title"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-[var(--color-overlay)] px-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-sm rounded-[var(--border-radius-card)] bg-[var(--color-background)] p-8 shadow-[var(--shadow-floating)]"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="닫기"
          className="absolute right-4 top-4 text-[color:var(--color-text-muted)] hover:text-[color:var(--color-text-primary)]"
        >
          <X className="h-5 w-5" />
        </button>

        <h2
          id="login-modal-title"
          className="mb-1 text-xl font-bold text-[color:var(--color-text-primary)]"
        >
          관리자 로그인
        </h2>
        <p className="mb-6 text-sm text-[color:var(--color-text-muted)]">
          이 홈페이지를 편집하려면 로그인하세요.
        </p>

        <LoginForm
          tenantSlug={tenantSlug}
          onSuccess={onClose}
          autoFocus
        />
      </div>
    </div>
  )
}
