import { type ReactNode, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Sparkles, X } from 'lucide-react'
import type { AssistUsage } from '@/lib/aiAssist'

interface AiDrawerProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  /** 아래 버튼 줄 */
  footer: ReactNode
  /** 이번 달 남은 횟수 — 받기 전에는 없다 */
  usage?: AssistUsage
}

/**
 * AI 보조 결과 서랍 (기획서 2.0, T-231-A) — 넓은 화면은 오른쪽, 휴대폰은 아래에서 올라온다.
 * 결과는 미리보기일 뿐 — 적용해도 저장은 그 화면의 저장 막대로.
 */
export function AiDrawer({ open, onClose, title, children, footer, usage }: AiDrawerProps) {
  const panel = useRef<HTMLDivElement>(null)

  // 열릴 때 한 번만 서랍으로 — 고르는 동안 다시 그려져도 초점을 빼앗지 않게
  useEffect(() => {
    if (open) panel.current?.focus()
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return createPortal(
    <div
      className="fixed inset-0 z-50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ai-drawer-title"
    >
      <div className="absolute inset-0 bg-black/40" aria-hidden onClick={onClose} />
      <div
        ref={panel}
        tabIndex={-1}
        className="absolute inset-x-0 bottom-0 flex max-h-[85vh] flex-col rounded-t-2xl bg-white shadow-2xl outline-none sm:inset-y-0 sm:left-auto sm:right-0 sm:max-h-none sm:w-[28rem] sm:rounded-none"
      >
        <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4">
          <Sparkles className="h-4 w-4 text-violet-600" aria-hidden />
          <h2 id="ai-drawer-title" className="mr-auto text-base font-semibold text-slate-900">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="닫기"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <p className="rounded-lg bg-violet-50 px-3 py-2 text-xs text-violet-800" role="note">
            AI 가 만든 초안이에요. 사실과 다른 내용이 없는지 확인해 주세요.
          </p>
          {children}
        </div>
        <div className="space-y-2 border-t border-slate-100 px-5 py-4">
          <div className="flex flex-wrap justify-end gap-2">{footer}</div>
          {usage && (
            <p className="text-right text-xs text-slate-400">
              이번 달 AI 사용{' '}
              {usage.limit === null
                ? `${usage.used}회 (제한 없음)`
                : `${usage.used} / ${usage.limit}회 · ${usage.remaining}회 남음`}
            </p>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
