'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2, Send, Sparkles, Undo2, X } from 'lucide-react'
import { toast } from 'sonner'
import { useAiChat } from '@/hooks/useAiChat'
import { applyTextAction, applyThemeAction, revertTheme } from '@/lib/aiActions'
import type { AiAction } from '@/lib/aiChatStream'
import { useEditStore } from '@/lib/editStore'

export function AiEditPanel() {
  const isEditMode = useEditStore((s) => s.isEditMode)
  const isOpen = useEditStore((s) => s.isAiPanelOpen)
  const setOpen = useEditStore((s) => s.setAiPanelOpen)
  const updateField = useEditStore((s) => s.updateField)

  const { messages, isStreaming, error, send } = useAiChat()
  const [input, setInput] = useState('')
  const [themeBackup, setThemeBackup] = useState<Record<string, string> | null>(
    null,
  )
  const listRef = useRef<HTMLDivElement | null>(null)

  // 새 메시지/델타 도착 시 하단으로 스크롤
  useEffect(() => {
    const el = listRef.current
    if (el && typeof el.scrollTo === 'function') {
      el.scrollTo({ top: el.scrollHeight })
    }
  }, [messages])

  if (!isEditMode || !isOpen) return null

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const text = input.trim()
    if (!text || isStreaming) return
    setInput('')
    void send(text)
  }

  const handleApplyText = (action: AiAction) => {
    if (applyTextAction(action, updateField)) {
      toast.success('변경사항을 적용했습니다.')
    }
  }

  const handleApplyTheme = (action: AiAction) => {
    setThemeBackup(applyThemeAction(action))
    toast.success('색상 테마를 미리 적용했어요.')
  }

  const handleRevertTheme = () => {
    if (themeBackup) {
      revertTheme(themeBackup)
      setThemeBackup(null)
    }
  }

  const renderActions = (actions: AiAction[]) =>
    actions.map((action, i) => {
      if (action.action === 'update_text' && action.new_value) {
        return (
          <div
            key={i}
            className="mt-2 rounded-[var(--border-radius-base)] border border-[color:var(--color-border)] p-2"
          >
            <p className="text-xs text-[color:var(--color-text-primary)]">
              {action.new_value}
            </p>
            <button
              type="button"
              onClick={() => handleApplyText(action)}
              className="mt-1.5 text-xs font-semibold text-[color:var(--color-primary)]"
            >
              적용
            </button>
          </div>
        )
      }
      if (action.action === 'update_theme') {
        return (
          <div key={i} className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => handleApplyTheme(action)}
              className="rounded-[var(--border-radius-base)] bg-[var(--color-primary)] px-2.5 py-1 text-xs font-medium text-[color:var(--color-on-primary)]"
            >
              이대로 적용
            </button>
            <button
              type="button"
              onClick={handleRevertTheme}
              disabled={!themeBackup}
              className="inline-flex items-center gap-1 rounded-[var(--border-radius-base)] border border-[color:var(--color-border)] px-2.5 py-1 text-xs font-medium text-[color:var(--color-text-secondary)] disabled:opacity-40"
            >
              <Undo2 className="h-3 w-3" />
              원래대로
            </button>
          </div>
        )
      }
      return null
    })

  return (
    <aside
      role="complementary"
      aria-label="AI 편집 어시스턴트"
      className="fixed right-0 top-0 z-[55] flex h-full w-full max-w-sm flex-col border-l border-[color:var(--color-border)] bg-[var(--color-background)] shadow-[var(--shadow-floating)]"
    >
      <header className="flex items-center justify-between border-b border-[color:var(--color-border)] px-4 py-3">
        <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-[color:var(--color-text-primary)]">
          <Sparkles className="h-4 w-4 text-[color:var(--color-primary)]" />
          AI 편집 어시스턴트
        </span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="패널 닫기"
          className="text-[color:var(--color-text-muted)] hover:text-[color:var(--color-text-primary)]"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        <p className="rounded-[var(--border-radius-card)] bg-[var(--color-surface)] p-3 text-xs text-[color:var(--color-text-secondary)]">
          안녕하세요! 홈페이지 편집을 도와드릴게요. 🤖 원하시는 변경사항을
          말씀해 주세요.
        </p>

        {messages.map((m) => (
          <div
            key={m.id}
            className={m.role === 'user' ? 'text-right' : 'text-left'}
          >
            <div
              className={[
                'inline-block max-w-[85%] rounded-[var(--border-radius-card)] px-3 py-2 text-xs',
                m.role === 'user'
                  ? 'bg-[var(--color-primary)] text-[color:var(--color-on-primary)]'
                  : 'bg-[var(--color-surface)] text-[color:var(--color-text-primary)]',
              ].join(' ')}
            >
              <span className="whitespace-pre-wrap">{m.content}</span>
              {m.streaming && (
                <Loader2
                  className="ml-1 inline h-3 w-3 animate-spin align-middle"
                  data-testid="ai-chat-streaming"
                />
              )}
            </div>
            {m.role === 'assistant' && renderActions(m.actions)}
          </div>
        ))}

        {error && (
          <p className="text-xs text-[color:var(--color-danger)]">{error}</p>
        )}
      </div>

      <form
        onSubmit={handleSubmit}
        className="flex items-center gap-2 border-t border-[color:var(--color-border)] px-3 py-2"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="무엇을 바꾸고 싶으신가요?"
          aria-label="AI에게 요청할 내용"
          className="flex-1 rounded-[var(--border-radius-base)] border border-[color:var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-xs text-[color:var(--color-text-primary)] outline-none focus:border-[color:var(--color-primary)]"
        />
        <button
          type="submit"
          disabled={isStreaming || !input.trim()}
          aria-label="전송"
          className="inline-flex h-9 w-9 items-center justify-center rounded-[var(--border-radius-base)] bg-[var(--color-primary)] text-[color:var(--color-on-primary)] transition hover:bg-[var(--color-primary-hover)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isStreaming ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </button>
      </form>
    </aside>
  )
}
