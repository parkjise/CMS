'use client'

import { useState } from 'react'
import type { GuestPost, PublicBoard, ReportReason } from '@cms/types'
import { GUEST_PASSWORD_MAX, useGuestPassword } from '@/components/board/useMemberPostForm'
import { REPORT_REASONS, reportPost } from '@/lib/guestBoard'
import { MemberPostError } from '@/lib/memberBoard'

interface PasswordFormProps {
  id: string
  label: string
  submitLabel: string
  value: string
  error: string
  busy: boolean
  onChange: (value: string) => void
  onSubmit: () => void
  onCancel?: () => void
}

/** 글 비밀번호 한 칸 — 비회원 글 삭제 · 비밀글 열기 (T-151-B) */
function PasswordForm({ id, label, submitLabel, value, error, busy, onChange, onSubmit, onCancel }: PasswordFormProps) {
  return (
    <form
      className="board-inline-form"
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit()
      }}
    >
      <label className="sr-only" htmlFor={id}>
        {label}
      </label>
      <input
        className="board-form__input board-inline-form__input"
        type="password"
        id={id}
        placeholder={label}
        autoComplete="off"
        maxLength={GUEST_PASSWORD_MAX}
        value={value}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
      <button className="board-list__write" type="submit" disabled={busy}>
        {submitLabel}
      </button>
      {onCancel && (
        <button className="board-list__write" type="button" onClick={onCancel}>
          취소
        </button>
      )}
      {error && (
        <p className="board-inline-form__error" id={`${id}-error`} role="alert">
          {error}
        </p>
      )}
    </form>
  )
}

interface GuestPostActionsProps {
  board: PublicBoard
  tenantSlug: string
  postId: string
  editHref: string
  listHref: string
}

/** 비회원 글의 [수정] [삭제] — 누가 썼는지 알 수 없어 모두에게 보이고, 글 비밀번호로 확인한다 */
export function GuestPostActions({ board, tenantSlug, postId, editHref, listHref }: GuestPostActionsProps) {
  const [deleting, setDeleting] = useState(false)
  const form = useGuestPassword(tenantSlug, board, postId)
  return (
    <div className="board-list__actions board-list__actions--wrap">
      <a className="board-list__write" href={editHref}>
        수정
      </a>
      {deleting ? (
        <PasswordForm
          id={`guest-delete-${postId}`}
          label="글 비밀번호"
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
        <button className="board-list__write" type="button" onClick={() => setDeleting(true)}>
          삭제
        </button>
      )}
    </div>
  )
}

/** 비회원 비밀글 열기 — 글 비밀번호가 맞으면 내용을 넘긴다 */
export function GuestUnlock({
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
    <div className="board-view__secret">
      <i className="ri-lock-line" aria-hidden="true" />
      <p>비밀글입니다. 글을 쓸 때 정한 비밀번호를 입력하면 볼 수 있습니다.</p>
      <PasswordForm
        id={`guest-open-${postId}`}
        label="글 비밀번호"
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

/** 글 신고 (T-151-B) — 사유를 고르고 보낸다. 같은 사람은 한 글에 한 번 */
export function ReportButton({ board, tenantSlug, postId }: { board: PublicBoard; tenantSlug: string; postId: string }) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState<ReportReason>('SPAM')
  const [detail, setDetail] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [done, setDone] = useState(false)

  if (done) {
    return (
      <p className="board-report__done" role="status">
        {message}
      </p>
    )
  }
  if (!open) {
    return (
      <div className="board-report">
        <button className="board-report__toggle" type="button" onClick={() => setOpen(true)}>
          <i className="ri-error-warning-line" aria-hidden="true" /> 신고
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
      className="board-report board-report--open"
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      <fieldset className="board-report__reasons">
        <legend className="board-report__legend">신고 사유</legend>
        {REPORT_REASONS.map((option) => (
          <label className="board-report__reason" key={option.value}>
            <input
              type="radio"
              name={`report-${postId}`}
              checked={reason === option.value}
              onChange={() => setReason(option.value)}
            />
            {option.label}
          </label>
        ))}
      </fieldset>
      <label className="sr-only" htmlFor={`report-detail-${postId}`}>
        자세한 내용 (선택)
      </label>
      <input
        className="board-form__input"
        id={`report-detail-${postId}`}
        placeholder="자세한 내용 (선택)"
        maxLength={200}
        value={detail}
        onChange={(e) => setDetail(e.target.value)}
      />
      {message && (
        <p className="board-inline-form__error" role="alert">
          {message}
        </p>
      )}
      <div className="board-list__actions">
        <button className="board-list__write" type="button" onClick={() => setOpen(false)}>
          취소
        </button>
        <button className="board-list__write" type="submit" disabled={busy}>
          신고하기
        </button>
      </div>
    </form>
  )
}
