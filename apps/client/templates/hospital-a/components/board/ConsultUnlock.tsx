'use client'

import { useState, type FormEvent } from 'react'
import { publicApi } from '@/lib/api'
import type { BoardPost } from '@/lib/publicBoard'
import { ConsultPostView } from './ConsultPostView'

interface Props {
  tenantSlug: string
  post: BoardPost
  brandName: string
  prevHref: string | null
  nextHref: string | null
  listHref: string
}

/**
 * 비밀글 열람 — 작성할 때 입력한 비밀번호 확인 후 내용·답변 표시
 * (POST /api/public/inquiries/board/{id}/unlock, IP당 분당 10회)
 */
export function ConsultUnlock({ tenantSlug, post, brandName, prevHref, nextHref, listHref }: Props) {
  const [unlocked, setUnlocked] = useState<BoardPost | null>(null)
  const [status, setStatus] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (unlocked) {
    return (
      <ConsultPostView post={unlocked} brandName={brandName} prevHref={prevHref} nextHref={nextHref} listHref={listHref} />
    )
  }

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const input = e.currentTarget.elements.namedItem('password') as HTMLInputElement
    if (!input.value) {
      input.setAttribute('aria-invalid', 'true')
      input.focus()
      setStatus('비밀번호를 입력해 주세요.')
      return
    }
    setSubmitting(true)
    try {
      const { data } = await publicApi.post(
        `/inquiries/board/${post.id}/unlock`,
        { password: input.value },
        { params: { tenant_slug: tenantSlug } },
      )
      setUnlocked(data.data as BoardPost)
    } catch {
      input.setAttribute('aria-invalid', 'true')
      input.select()
      setStatus('비밀번호가 일치하지 않습니다.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="board-form" aria-labelledby="consult-unlock-title">
      <div className="page-container">
        <form className="board-form__form" noValidate onSubmit={onSubmit}>
          <div className="board-form__panel board-form__panel--narrow">
            <h2 className="board-view__title" id="consult-unlock-title">
              <span className="board-view__badge">비밀글</span>
              {post.subject}
            </h2>
            <p className="board-form__help">작성자와 관리자만 볼 수 있어요. 글을 쓸 때 입력한 비밀번호를 입력해 주세요.</p>
            <div className="board-form__list">
              <div className="board-form__row">
                <label className="board-form__label" htmlFor="cu-password">
                  비밀번호
                </label>
                <input className="board-form__input" type="password" id="cu-password" name="password" autoComplete="current-password" maxLength={50} />
              </div>
            </div>
            <p className="board-form__status" role="status" aria-live="polite">
              {status}
            </p>
          </div>
          <div className="board-form__actions">
            <a className="board-form__cancel" href={listHref}>
              목록
            </a>
            <button className="board-form__submit" type="submit" disabled={submitting}>
              {submitting ? '확인 중…' : '확인'}
            </button>
          </div>
        </form>
      </div>
    </section>
  )
}
