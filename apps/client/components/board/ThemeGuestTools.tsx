'use client'

import { useState } from 'react'
import type { GuestPost, PublicBoard, ReportReason } from '@cms/types'
import { Flag, Lock } from 'lucide-react'
import { REPORT_REASONS, reportPost } from '@/lib/guestBoard'
import { MemberPostError } from '@/lib/memberBoard'
import { GUEST_PASSWORD_MAX, useGuestPassword } from './useMemberPostForm'

const pill =
  'rounded-full border border-[color:var(--color-border)] px-4 py-2 text-sm text-[color:var(--color-text-primary)] hover:bg-[var(--color-surface)] disabled:opacity-50'
const field =
  'h-10 rounded-md border border-[color:var(--color-border)] bg-transparent px-3 text-base text-[color:var(--color-text-primary)] md:text-sm aria-[invalid=true]:border-red-500'

interface PasswordFormProps {
  id: string
  submitLabel: string
  value: string
  error: string
  busy: boolean
  onChange: (value: string) => void
  onSubmit: () => void
  onCancel?: () => void
}

function PasswordForm({ id, submitLabel, value, error, busy, onChange, onSubmit, onCancel }: PasswordFormProps) {
  return (
    <form
      className="flex flex-wrap items-center justify-end gap-2"
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit()
      }}
    >
      <label className="sr-only" htmlFor={id}>
        글 비밀번호
      </label>
      <input
        id={id}
        type="password"
        placeholder="글 비밀번호"
        autoComplete="off"
        maxLength={GUEST_PASSWORD_MAX}
        className={`w-44 ${field}`}
        value={value}
        aria-invalid={error ? true : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
      <button type="submit" className={pill} disabled={busy}>
        {submitLabel}
      </button>
      {onCancel && (
        <button type="button" className={pill} onClick={onCancel}>
          취소
        </button>
      )}
      {error && (
        <p role="alert" className="basis-full text-right text-sm text-red-600">
          {error}
        </p>
      )}
    </form>
  )
}

interface GuestActionsProps {
  board: PublicBoard
  tenantSlug: string
  postId: string
  editHref: string
  listHref: string
}

/** 비회원 글의 [수정] [삭제] — 테마형 (T-151-B). 글 비밀번호로 확인한다 */
export function ThemeGuestPostActions({ board, tenantSlug, postId, editHref, listHref }: GuestActionsProps) {
  const [deleting, setDeleting] = useState(false)
  const form = useGuestPassword(tenantSlug, board, postId)
  return (
    <>
      <a href={editHref} className={pill}>
        수정
      </a>
      {deleting ? (
        <PasswordForm
          id={`theme-guest-delete-${postId}`}
          submitLabel="삭제"
          value={form.password}
          error={form.error}
          busy={form.busy}
          onChange={form.setPassword}
          onSubmit={async () => {
            if (await form.remove()) window.location.assign(listHref)
          }}
          onCancel={() => setDeleting(false)}
        />
      ) : (
        <button type="button" className={pill} onClick={() => setDeleting(true)}>
          삭제
        </button>
      )}
    </>
  )
}

/** 비회원 비밀글 열기 — 테마형 */
export function ThemeGuestUnlock({
  board,
  tenantSlug,
  postId,
  onOpen,
}: {
  board: PublicBoard
  tenantSlug: string
  postId: string
  onOpen: (post: GuestPost) => void
}) {
  const form = useGuestPassword(tenantSlug, board, postId)
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center text-[color:var(--color-text-muted)]">
      <Lock className="h-8 w-8" aria-hidden />
      <p>비밀글입니다. 글을 쓸 때 정한 비밀번호를 입력하면 볼 수 있습니다.</p>
      <PasswordForm
        id={`theme-guest-open-${postId}`}
        submitLabel="확인"
        value={form.password}
        error={form.error}
        busy={form.busy}
        onChange={form.setPassword}
        onSubmit={async () => {
          const post = await form.open()
          if (post) onOpen(post)
        }}
      />
    </div>
  )
}

/** 글 신고 — 테마형 (T-151-B) */
export function ThemeReportButton({ board, tenantSlug, postId }: { board: PublicBoard; tenantSlug: string; postId: string }) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState<ReportReason>('SPAM')
  const [detail, setDetail] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [done, setDone] = useState(false)
  const muted = 'text-[color:var(--color-text-muted)]'

  if (done) {
    return (
      <p role="status" className={`mt-4 text-right text-sm ${muted}`}>
        {message}
      </p>
    )
  }
  if (!open) {
    return (
      <div className="mt-4 flex justify-end">
        <button
          type="button"
          className={`inline-flex items-center gap-1 text-sm hover:underline ${muted}`}
          onClick={() => setOpen(true)}
        >
          <Flag className="h-4 w-4" aria-hidden /> 신고
        </button>
      </div>
    )
  }

  const submit = async () => {
    setBusy(true)
    setMessage('')
    try {
      const result = await reportPost(tenantSlug, board.slug, postId, reason, detail.trim())
      setMessage(
        result.hidden ? '신고했습니다. 신고가 쌓여 글을 잠시 숨겼습니다.' : '신고했습니다. 관리자가 확인합니다.',
      )
      setDone(true)
    } catch (error) {
      setMessage(error instanceof MemberPostError ? error.message : '신고하지 못했습니다. 잠시 뒤 다시 시도해 주세요.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      className="mt-4 space-y-3 rounded-xl border border-[color:var(--color-border)] p-4"
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      <fieldset className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-[color:var(--color-text-primary)]">
        <legend className="mb-2 w-full font-semibold">신고 사유</legend>
        {REPORT_REASONS.map((option) => (
          <label key={option.value} className="inline-flex items-center gap-1.5">
            <input
              type="radio"
              name={`theme-report-${postId}`}
              checked={reason === option.value}
              onChange={() => setReason(option.value)}
            />
            {option.label}
          </label>
        ))}
      </fieldset>
      <label className="sr-only" htmlFor={`theme-report-detail-${postId}`}>
        자세한 내용 (선택)
      </label>
      <input
        id={`theme-report-detail-${postId}`}
        placeholder="자세한 내용 (선택)"
        maxLength={200}
        className={`w-full ${field}`}
        value={detail}
        onChange={(e) => setDetail(e.target.value)}
      />
      {message && (
        <p role="alert" className="text-sm text-red-600">
          {message}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" className={pill} onClick={() => setOpen(false)}>
          취소
        </button>
        <button type="submit" className={pill} disabled={busy}>
          신고하기
        </button>
      </div>
    </form>
  )
}
